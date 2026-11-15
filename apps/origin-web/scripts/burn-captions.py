#!/usr/bin/env python3
"""Render reproducible caption plates with Pillow, then overlay an uncut take.
Usage: python3 burn-captions.py /tmp/rec/shot01/run.json captions/shot01.json OUT.mp4 POSTER.webp
Requires Pillow and ffmpeg. No drawtext or platform font is used.

Layout at 1280x720: a small "recorded" pill in the top-left corner for the whole take, and
at most one caption at a time, as one compact bar anchored 24 px above the picture's bottom
edge (the site's player tray keeps the native controls below the picture).
"""
import hashlib
import json
from pathlib import Path
import string
import subprocess
import sys
from PIL import Image, ImageDraw, ImageFont

W, H = 1280, 720
FONT = Path(__file__).with_name('fonts') / 'Carlito-Regular.ttf'
CAPTION_PX, TAG_PX = 25, 20
PAD_X, PAD_Y = 20, 8           # caption bar padding
TAG_PAD_X, TAG_PAD_Y = 14, 6   # pill padding
LINE_GAP = 6
BOTTOM = 24                    # the bar ends at y = 696, as the site's frame tray assumes
MAX_W = round(W * 0.78)        # the bar is at most 78% of the frame wide
MAX_LINES = 2
TAG_XY = (24, 24)
TAG_MAX_W = W // 3
INK = (39, 45, 38, round(0.82 * 255))  # caption bar: rgba(39,45,38,0.82), the site's ink, translucent
PILL_INK = (39, 45, 38, 255)          # the pill is opaque, so the page under the corner never shows through its text

def format_caption(text, facts):
    for _, key, _, _ in string.Formatter().parse(text):
        if key and (key not in facts or facts[key] is None):
            raise ValueError(f'Missing caption fact: {key}')
    return text.format(**facts)

def interval(caption, beats, lead):
    if caption['from'] not in beats or caption['to'] not in beats:
        raise ValueError('Missing caption beat')
    start, end = beats[caption['from']] - lead, beats[caption['to']] - lead
    if start < 0 or end <= start:
        raise ValueError('Invalid caption interval')
    return start, end

def one_at_a_time(intervals):
    """Captions follow one another: a caption never starts before the previous one ends."""
    intervals = sorted(intervals)
    for (_, previous_end), (start, _) in zip(intervals, intervals[1:]):
        if start < previous_end:
            raise ValueError('Two captions would show at once')

def wrap(draw, text, font, width):
    lines, line = [], ''
    for word in text.split():
        candidate = f'{line} {word}'.strip()
        if draw.textlength(candidate, font=font) > width:
            if not line or draw.textlength(word, font=font) > width:
                raise ValueError('Caption word exceeds the frame')
            lines.append(line); line = word
        else:
            line = candidate
    if line: lines.append(line)
    return lines

def plate(text, font, kind):
    """One overlay plate: the corner pill ('tag') or the bottom caption bar ('caption')."""
    image = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    ascent, descent = font.getmetrics()
    line_height = ascent + descent
    if kind == 'tag':
        pad_x, pad_y = TAG_PAD_X, TAG_PAD_Y
        lines = [text]
        width = round(draw.textlength(text, font=font)) + 2 * pad_x
        if width > TAG_MAX_W:
            raise ValueError('The corner pill must stay small (one line, at most a third of the frame)')
        height = line_height + 2 * pad_y
        x, y = TAG_XY
        radius, fill = height // 2, PILL_INK
    else:
        pad_x, pad_y = PAD_X, PAD_Y
        lines = wrap(draw, text, font, MAX_W - 2 * pad_x)
        if len(lines) > MAX_LINES:
            raise ValueError(f'Caption needs more than {MAX_LINES} lines at {font.size}px')
        width = round(max(draw.textlength(line, font=font) for line in lines)) + 2 * pad_x
        height = len(lines) * line_height + (len(lines) - 1) * LINE_GAP + 2 * pad_y
        x, y = (W - width) // 2, H - BOTTOM - height
        radius, fill = 8, INK
    box = (x, y, x + width, y + height)
    draw.rounded_rectangle(box, radius=radius, fill=fill)
    for i, line in enumerate(lines):
        baseline = y + pad_y + ascent + i * (line_height + LINE_GAP)
        draw.text((x + pad_x, baseline), line, font=font, fill='white', anchor='ls')
    return image, box

def burn(run_path, spec_path, output, poster):
    run_path, output, poster = Path(run_path), Path(output), Path(poster)
    run, spec = json.loads(run_path.read_text()), json.loads(Path(spec_path).read_text())
    sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
    raw = run_path.parent / run['raw_file']
    if sha(raw) != run['raw_sha256'] or sha(FONT) != run['font_sha256']:
        raise ValueError('Raw recording or bundled font differs from run.json')
    if run['release']['source'] != 'release' or run['release']['commit'] != run['commit']:
        raise ValueError('Missing or inconsistent release provenance')
    facts = {**run['facts'], 'date': run['date'], 'host': run['host'], 'commit': run['commit']}
    beats = {beat['name']: beat['t'] for beat in run['beats']}
    lead, end = 0, beats['end']  # Keep the entire take, including the initial paint.
    cap_font, tag_font = ImageFont.truetype(str(FONT), CAPTION_PX), ImageFont.truetype(str(FONT), TAG_PX)
    tag_text = format_caption(spec['tag'], facts)
    tag, tag_box = plate(tag_text, tag_font, 'tag')
    plates = [(tag, 0, end, tag_text, tag_box)]
    for caption in spec['captions']:
        start, stop = interval(caption, beats, lead)
        text = format_caption(caption['text'], facts)
        image, box = plate(text, cap_font, 'caption')
        plates.append((image, start, stop, text, box))
    one_at_a_time([(start, stop) for _, start, stop, _, _ in plates[1:]])
    # Validate every fact/beat/layout before writing anything or starting ffmpeg.
    poster_time = beats[spec['poster_beat']] + 1.5
    if poster_time >= end: raise ValueError('Poster beat is outside the recording')
    output.parent.mkdir(parents=True, exist_ok=True)
    poster.parent.mkdir(parents=True, exist_ok=True)
    plate_dir = run_path.parent / 'plates'; plate_dir.mkdir(exist_ok=True)
    inputs, filters = [], [f'[0:v]scale={W}:{H}:flags=lanczos,fps=25,format=yuv420p[v0]']
    for i, (image, start, stop, _, _) in enumerate(plates, 1):
        png = plate_dir / f'{i:02d}.png'; image.save(png)
        inputs += ['-i', str(png)]
        filters.append(f"[v{i-1}][{i}:v]overlay=0:0:enable='gte(t,{start:.3f})*lt(t,{stop:.3f})'[v{i}]")
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(raw), *inputs, '-t', str(end),
        '-filter_complex', ';'.join(filters), '-map', f'[v{len(plates)}]', '-an', '-c:v', 'libx264',
        '-preset', 'slow', '-crf', '26', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(output)], check=True)
    poster_png = run_path.parent / 'poster.png'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(poster_time), '-i', str(output), '-frames:v', '1', str(poster_png)], check=True)
    with Image.open(poster_png) as image: image.save(poster, 'WEBP', quality=78)
    run['render'] = {'output': output.name, 'sha256': sha(output), 'poster': poster.name, 'poster_sha256': sha(poster),
        'size': [W, H], 'caption_px': CAPTION_PX, 'tag_px': TAG_PX, 'tag_xy': list(TAG_XY), 'lead_trimmed_s': lead,
        'caption_max_w': MAX_W, 'caption_bottom_px': BOTTOM,
        'captions': [{'from_s': a, 'to_s': b, 'text': text, 'box': box} for _, a, b, text, box in plates]}
    run_path.write_text(json.dumps(run, indent=2) + '\n')
    print(json.dumps(run['render'], indent=2))

if __name__ == '__main__':
    if len(sys.argv) != 5: raise SystemExit(__doc__)
    burn(*sys.argv[1:])

#!/usr/bin/env python3
"""Render the corner pill with Pillow, overlay it on an uncut take, and record the caption cues.
Usage: python3 burn-captions.py /tmp/rec/shot01/run.json captions/shot01.json OUT.mp4 POSTER.webp
Requires Pillow and ffmpeg. No drawtext or platform font is used.

Layout at 1280x720 (Release 7, R05): one small opaque "recorded" pill in the top-left corner for
the whole take, over the site's sticky header, so it never covers the recorded page. Captions are
NOT drawn into the picture. Each caption is validated (its facts, its beats, one at a time) and
written to the manifest as a timed cue; recording-tracks.mjs turns the cues into the WebVTT
track, and the site's caption tray shows the active cue below the picture.
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
TAG_PX = 20
TAG_PAD_X, TAG_PAD_Y = 14, 6   # pill padding
TAG_XY = (24, 24)
TAG_MAX_W = W // 3
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

def plate(text, font):
    """The corner pill: one line, opaque, at most a third of the frame wide."""
    image = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    ascent, descent = font.getmetrics()
    width = round(draw.textlength(text, font=font)) + 2 * TAG_PAD_X
    if width > TAG_MAX_W:
        raise ValueError('The corner pill must stay small (one line, at most a third of the frame)')
    height = ascent + descent + 2 * TAG_PAD_Y
    x, y = TAG_XY
    box = (x, y, x + width, y + height)
    draw.rounded_rectangle(box, radius=height // 2, fill=PILL_INK)
    draw.text((x + TAG_PAD_X, y + TAG_PAD_Y + ascent), text, font=font, fill='white', anchor='ls')
    return image, box

def cue_text(text):
    """A caption cue is plain text for the tray and the track: one line of words, no markup."""
    if not text.strip() or '\n' in text or '<' in text or '-->' in text:
        raise ValueError('A caption cue must be one line of plain text')
    return text

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
    tag_font = ImageFont.truetype(str(FONT), TAG_PX)
    tag_text = format_caption(spec['tag'], facts)
    tag, tag_box = plate(tag_text, tag_font)
    cues = []
    for caption in spec['captions']:
        start, stop = interval(caption, beats, lead)
        cues.append((start, stop, cue_text(format_caption(caption['text'], facts))))
    one_at_a_time([(start, stop) for start, stop, _ in cues])
    # Validate every fact/beat/layout before writing anything or starting ffmpeg.
    poster_time = beats[spec['poster_beat']] + 1.5
    if poster_time >= end: raise ValueError('Poster beat is outside the recording')
    output.parent.mkdir(parents=True, exist_ok=True)
    poster.parent.mkdir(parents=True, exist_ok=True)
    plate_dir = run_path.parent / 'plates'; plate_dir.mkdir(exist_ok=True)
    inputs, filters = [], [f'[0:v]scale={W}:{H}:flags=lanczos,fps=25,format=yuv420p[v0]']
    png = plate_dir / '01.png'; tag.save(png)
    inputs += ['-i', str(png)]
    filters.append(f"[v0][1:v]overlay=0:0:enable='gte(t,0)*lt(t,{end:.3f})'[v1]")
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(raw), *inputs, '-t', str(end),
        '-filter_complex', ';'.join(filters), '-map', '[v1]', '-an', '-c:v', 'libx264',
        '-preset', 'slow', '-crf', '26', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(output)], check=True)
    poster_png = run_path.parent / 'poster.png'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(poster_time), '-i', str(output), '-frames:v', '1', str(poster_png)], check=True)
    with Image.open(poster_png) as image: image.save(poster, 'WEBP', quality=78)
    run['render'] = {'output': output.name, 'sha256': sha(output), 'poster': poster.name, 'poster_sha256': sha(poster),
        'size': [W, H], 'tag_px': TAG_PX, 'tag_xy': list(TAG_XY), 'lead_trimmed_s': lead,
        'captions_in_picture': False,
        'captions': [{'from_s': 0, 'to_s': end, 'text': tag_text, 'box': list(tag_box)}]
                    + [{'from_s': a, 'to_s': b, 'text': text} for a, b, text in cues]}
    run_path.write_text(json.dumps(run, indent=2) + '\n')
    print(json.dumps(run['render'], indent=2))

if __name__ == '__main__':
    if len(sys.argv) != 5: raise SystemExit(__doc__)
    burn(*sys.argv[1:])

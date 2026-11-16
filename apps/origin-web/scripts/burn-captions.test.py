import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('burn', Path(__file__).with_name('burn-captions.py'))
burn = importlib.util.module_from_spec(spec)
spec.loader.exec_module(burn)

def tag_font():
    return burn.ImageFont.truetype(str(burn.FONT), burn.TAG_PX)

class CaptionTests(unittest.TestCase):
    def test_missing_placeholder_refuses_render(self):
        with self.assertRaisesRegex(ValueError, 'Missing caption fact: planted'):
            burn.format_caption('{caught}/{planted} caught', {'caught': 90})

    def test_facts_are_substituted_without_invented_defaults(self):
        self.assertEqual(burn.format_caption('{caught}/{planted} caught · {fp} false positives', {'caught': 90, 'planted': 90, 'fp': 0}), '90/90 caught · 0 false positives')

    def test_caption_arrow_has_a_real_glyph(self):
        # The arrow reaches the tray and the track as text; the bundled font still draws it, so
        # the pill could carry it.
        font = tag_font()
        self.assertNotEqual(bytes(font.getmask('→')), bytes(font.getmask('\U0010FFFF')))

    def test_unknown_or_reversed_beats_refuse_render(self):
        with self.assertRaises(ValueError):
            burn.interval({'from': 'missing', 'to': 'end'}, {'painted': 1, 'end': 4}, 1)
        with self.assertRaises(ValueError):
            burn.interval({'from': 'end', 'to': 'painted'}, {'painted': 1, 'end': 4}, 1)

    # Release 7 (R05): no caption is drawn into the picture; cues are plain timed text.
    def test_no_caption_bar_is_drawn(self):
        self.assertFalse(hasattr(burn, 'CAPTION_PX'))
        self.assertFalse(hasattr(burn, 'MAX_LINES'))
        image, box = burn.plate('RECORDED · ONE TAKE · SYNTHETIC DATA', tag_font())
        # Below the pill the plate is transparent everywhere, including the old caption band.
        for y in range(box[3] + 1, 720, 8):
            for x in range(0, 1280, 16):
                self.assertEqual(image.getpixel((x, y))[3], 0)

    def test_cue_text_is_one_plain_line(self):
        self.assertEqual(burn.cue_text('Field restored: VALID (code 0), still offline'), 'Field restored: VALID (code 0), still offline')
        for bad in ['', 'two\nlines', '<b>markup</b>', 'a --> b']:
            with self.assertRaisesRegex(ValueError, 'one line of plain text'):
                burn.cue_text(bad)

    def test_recorded_pill_is_small_and_in_the_top_left_corner(self):
        image, box = burn.plate('RECORDED · ONE TAKE · SYNTHETIC DATA', tag_font())
        self.assertEqual((box[0], box[1]), (24, 24))
        self.assertLessEqual(box[2], 1280 // 3 + 24)
        self.assertLessEqual(box[3], 72)
        # Opaque, so the page under the corner never shows through its text.
        self.assertEqual(image.getpixel(((box[0] + box[2]) // 2, box[1] + 2))[3], 255)
        # Nothing else is drawn: the rest of the plate is transparent.
        self.assertEqual(image.getpixel((640, 360))[3], 0)
        self.assertEqual(image.getpixel((640, 690))[3], 0)

    def test_a_full_width_disclosure_bar_is_refused(self):
        with self.assertRaisesRegex(ValueError, 'pill must stay small'):
            burn.plate('One take · synthetic demo data · recorded 2026-09-28 on originphysicalai.com (57d5ccf) · captions and cursor dot overlaid', tag_font())

    def test_at_most_one_caption_at_a_time(self):
        burn.one_at_a_time([(0.8, 9.2), (9.2, 12.7), (12.7, 22.1)])
        with self.assertRaisesRegex(ValueError, 'Two captions would show at once'):
            burn.one_at_a_time([(0.8, 9.2), (9.0, 12.7)])
        with self.assertRaisesRegex(ValueError, 'Two captions would show at once'):
            burn.one_at_a_time([(9.0, 12.7), (0.8, 9.2)])

if __name__ == '__main__':
    unittest.main()

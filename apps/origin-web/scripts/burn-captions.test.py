import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('burn', Path(__file__).with_name('burn-captions.py'))
burn = importlib.util.module_from_spec(spec)
spec.loader.exec_module(burn)

def caption_font():
    return burn.ImageFont.truetype(str(burn.FONT), burn.CAPTION_PX)

class CaptionTests(unittest.TestCase):
    def test_missing_placeholder_refuses_render(self):
        with self.assertRaisesRegex(ValueError, 'Missing caption fact: planted'):
            burn.format_caption('{caught}/{planted} caught', {'caught': 90})

    def test_facts_are_substituted_without_invented_defaults(self):
        self.assertEqual(burn.format_caption('{caught}/{planted} caught · {fp} false positives', {'caught': 90, 'planted': 90, 'fp': 0}), '90/90 caught · 0 false positives')

    def test_caption_arrow_has_a_real_glyph(self):
        font = caption_font()
        self.assertNotEqual(bytes(font.getmask('→')), bytes(font.getmask('\U0010FFFF')))

    def test_unknown_or_reversed_beats_refuse_render(self):
        with self.assertRaises(ValueError):
            burn.interval({'from': 'missing', 'to': 'end'}, {'painted': 1, 'end': 4}, 1)
        with self.assertRaises(ValueError):
            burn.interval({'from': 'end', 'to': 'painted'}, {'painted': 1, 'end': 4}, 1)

    # Release 6 Phase 3 — one compact caption bar at the bottom, a small corner pill
    def test_caption_is_one_compact_bar_at_the_bottom(self):
        self.assertTrue(24 <= burn.CAPTION_PX <= 26)
        text = 'One tool added (payments.transfer): the legacy config-bound credential VOIDs (code 4); the downloaded evidence is unchanged'
        image, box = burn.plate(text, caption_font(), 'caption')
        self.assertEqual(image.size, (1280, 720))
        # At most 78% of the frame wide, centred, ending 24 px above the bottom edge.
        self.assertLessEqual(box[2] - box[0], round(1280 * 0.78))
        self.assertLessEqual(abs((box[0] + box[2]) - 1280), 1)
        self.assertEqual(box[3], 696)
        # Never mid-frame: the bar stays in the bottom fifth of the picture.
        self.assertGreaterEqual(box[1], 720 * 4 // 5)
        # Padding 8px 20px: the corner of the text area is the translucent ink, rgba(39,45,38,0.82).
        self.assertEqual(image.getpixel((box[0] + 10, (box[1] + box[3]) // 2)), (39, 45, 38, 209))
        self.assertEqual(image.getpixel((box[0] - 1, box[3] - 10))[3], 0)

    def test_short_caption_is_a_single_line_bar(self):
        image, box = burn.plate('Field restored: VALID (code 0), still offline', caption_font(), 'caption')
        ascent, descent = caption_font().getmetrics()
        self.assertEqual(box[3] - box[1], ascent + descent + 2 * 8)

    def test_caption_longer_than_two_lines_refuses_render(self):
        with self.assertRaisesRegex(ValueError, 'more than 2 lines'):
            burn.plate(' '.join(['synthetic'] * 60), caption_font(), 'caption')

    def test_recorded_pill_is_small_and_in_the_top_left_corner(self):
        font = burn.ImageFont.truetype(str(burn.FONT), burn.TAG_PX)
        image, box = burn.plate('RECORDED · ONE TAKE · SYNTHETIC DATA', font, 'tag')
        self.assertEqual((box[0], box[1]), (24, 24))
        self.assertLessEqual(box[2], 1280 // 3 + 24)
        self.assertLessEqual(box[3], 72)
        # Opaque, so the page under the corner never shows through its text.
        self.assertEqual(image.getpixel(((box[0] + box[2]) // 2, box[1] + 2))[3], 255)
        # Nothing else is drawn: the rest of the plate is transparent.
        self.assertEqual(image.getpixel((640, 360))[3], 0)
        self.assertEqual(image.getpixel((640, 690))[3], 0)

    def test_a_full_width_disclosure_bar_is_refused(self):
        font = burn.ImageFont.truetype(str(burn.FONT), burn.TAG_PX)
        with self.assertRaisesRegex(ValueError, 'pill must stay small'):
            burn.plate('One take · synthetic demo data · recorded 2026-09-28 on originphysicalai.com (57d5ccf) · captions and cursor dot overlaid', font, 'tag')

    def test_at_most_one_caption_at_a_time(self):
        burn.one_at_a_time([(0.8, 9.2), (9.2, 12.7), (12.7, 22.1)])
        with self.assertRaisesRegex(ValueError, 'Two captions would show at once'):
            burn.one_at_a_time([(0.8, 9.2), (9.0, 12.7)])
        with self.assertRaisesRegex(ValueError, 'Two captions would show at once'):
            burn.one_at_a_time([(9.0, 12.7), (0.8, 9.2)])

if __name__ == '__main__':
    unittest.main()

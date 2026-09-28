import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('burn', Path(__file__).with_name('burn-captions.py'))
burn = importlib.util.module_from_spec(spec)
spec.loader.exec_module(burn)

class CaptionTests(unittest.TestCase):
    def test_missing_placeholder_refuses_render(self):
        with self.assertRaisesRegex(ValueError, 'Missing caption fact: planted'):
            burn.format_caption('{caught}/{planted} caught', {'caught': 90})

    def test_facts_are_substituted_without_invented_defaults(self):
        self.assertEqual(burn.format_caption('{caught}/{planted} caught · {fp} false positives', {'caught': 90, 'planted': 90, 'fp': 0}), '90/90 caught · 0 false positives')

    def test_caption_arrow_has_a_real_glyph(self):
        font = burn.ImageFont.truetype(str(burn.FONT), 44)
        self.assertNotEqual(bytes(font.getmask('→')), bytes(font.getmask('\U0010FFFF')))

    def test_unknown_or_reversed_beats_refuse_render(self):
        with self.assertRaises(ValueError):
            burn.interval({'from': 'missing', 'to': 'end'}, {'painted': 1, 'end': 4}, 1)
        with self.assertRaises(ValueError):
            burn.interval({'from': 'end', 'to': 'painted'}, {'painted': 1, 'end': 4}, 1)

    def test_long_caption_wraps_inside_frame_at_required_size(self):
        font = burn.ImageFont.truetype(str(Path(__file__).with_name('fonts') / 'Carlito-Regular.ttf'), 44)
        text = 'One tool added (payments.transfer): the legacy config-bound credential VOIDs (code 4); the downloaded evidence is unchanged'
        image, box = burn.plate(text, font, 'caption')
        self.assertEqual(image.size, (1280, 720))
        self.assertGreaterEqual(box[0], 24)
        self.assertLessEqual(box[2], 1256)
        self.assertGreaterEqual(box[1], 200)
        self.assertLessEqual(box[3], 696)

if __name__ == '__main__':
    unittest.main()

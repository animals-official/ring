import io
import json
import os
import subprocess
import tempfile
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from shutil import copy2
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_SIZE = 1500
OUTPUT_DIMENSIONS = (OUTPUT_SIZE, OUTPUT_SIZE)


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

with tempfile.TemporaryDirectory() as root:
    site = Path(root) / 'ring'
    site.mkdir()
    for file in ['index.html', 'style.css', 'app.js', 'image.js']:
        copy2(ROOT / file, site)
    (site / 'assets').mkdir()
    copy2(ROOT / 'assets' / 'animals-logo.png', site / 'assets')
    (site / 'rings').mkdir()
    (site / 'scripts').mkdir()
    copy2(ROOT / 'scripts' / 'generate-rings.mjs', site / 'scripts')

    def manifest():
        subprocess.run(['node', str(site / 'scripts/generate-rings.mjs')], check=True)
        return json.loads((site / 'rings.json').read_text())

    demo_file = 'テスト レッド.png'
    demo_ring = Image.new('RGBA', OUTPUT_DIMENSIONS)
    ImageDraw.Draw(demo_ring).ellipse((1, 1, 1498, 1498), outline='#f32349', width=32)
    demo_ring.save(site / 'rings' / demo_file)
    assert manifest() == [{'name': 'テスト レッド', 'file': demo_file}]

    extra = site / 'rings' / '追加 リング.PNG'
    renamed = extra.with_name('変更 #リング.PNG')
    alternate = Image.new('RGBA', (600, 600))
    ImageDraw.Draw(alternate).ellipse((280, 280, 319, 319), fill=(0, 255, 0, 255))
    alternate.save(extra)
    assert len(manifest()) == 2
    extra.rename(renamed)
    assert {entry['file'] for entry in manifest()} == {demo_file, renamed.name}
    (site / 'rings' / 'ignored.jpg').touch()

    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=root))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{server.server_port}/ring/'

    def photo(format):
        buffer = io.BytesIO()
        Image.new('RGB', (640, 480), (40, 100, 180)).save(buffer, format)
        return {'name': 'test.' + format.lower(), 'mimeType': 'image/' + format.lower(), 'buffer': buffer.getvalue()}

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE'))
        page = browser.new_page(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
        requests = []
        errors = []
        page.on('request', lambda req: requests.append(req))
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.add_init_script('''
            window.pickerClicks = 0;
            const showPicker = HTMLInputElement.prototype.showPicker;
            HTMLInputElement.prototype.showPicker = function () {
              if (this.id === 'photo') window.pickerClicks++;
              return showPicker.call(this);
            };
            document.addEventListener('click', event => {
              if (event.target.id === 'photo') window.pickerClicks++;
            });
        ''')
        page.goto(url)
        logo = page.get_by_role('heading', name='ANIMALS', exact=True).get_by_role('img')
        expect(logo).to_be_visible()
        assert logo.evaluate('image => image.decode().then(() => image.naturalWidth)') > 0
        logo_ratio = logo.evaluate('image => image.naturalWidth / image.naturalHeight')
        mobile_logo = logo.bounding_box()
        assert mobile_logo['width'] <= 390
        assert abs(mobile_logo['width'] / mobile_logo['height'] - logo_ratio) < .03
        first = page.get_by_role('button', name='テスト レッド')
        second = page.get_by_role('button', name='変更 #リング')
        expect(first).to_have_attribute('aria-pressed', 'true')
        assert page.evaluate('document.documentElement.scrollWidth === innerWidth')
        expect(page.get_by_text('1500 × 1500 PX', exact=True)).to_be_visible()
        uploader = page.locator('#photo')
        save = page.get_by_role('button', name='画像を保存する！')
        expect(page.get_by_text('AWAKEN THE WILD WITHIN THE SOUND', exact=True)).to_be_visible()
        assert page.evaluate('window.pickerClicks') == 0
        with page.expect_file_chooser() as chooser:
            first.tap()
        chooser.value.set_files([])
        assert page.evaluate('window.pickerClicks') == 1
        preview_picker = page.get_by_role('button', name='プレビューから写真を選ぶ')
        with page.expect_file_chooser() as chooser:
            preview_picker.tap()
        chooser.value.set_files([])
        assert page.evaluate('window.pickerClicks') == 2
        for format in ('JPEG', 'PNG', 'WEBP'):
            uploader.set_input_files(photo(format))
            expect(page.locator('#photo-status')).to_have_text('test.' + format.lower())
            expect(save).to_be_enabled()
            expect(preview_picker).to_be_hidden()

        def download():
            with page.expect_download() as result:
                save.click()
            assert result.value.suggested_filename == 'animals-icon.png'
            output = Image.open(result.value.path())
            assert output.format == 'PNG' and output.mode == 'RGBA' and output.size == OUTPUT_DIMENSIONS
            assert output.getpixel((0, 0))[3] == 0
            return output

        output = download()
        assert output.getpixel((750, 750)) == (40, 100, 180, 255)
        assert output.getpixel((58, 750)) == (40, 100, 180, 255)
        assert output.getpixel((10, 750)) != (40, 100, 180, 255)
        second.click()
        expect(second).to_have_attribute('aria-pressed', 'true')
        expect(first).to_have_attribute('aria-pressed', 'false')
        expect(save).to_be_enabled()
        assert download().getpixel((750, 750)) == (0, 255, 0, 255)
        assert page.evaluate('window.pickerClicks') == 2

        canvas = page.locator('canvas')
        canvas.scroll_into_view_if_needed()
        box = canvas.bounding_box()
        cx, cy = box['x'] + box['width']/2, box['y'] + box['height']/2
        page.mouse.move(cx, cy)
        page.mouse.down()
        page.mouse.move(cx + 30, cy + 15)
        page.mouse.up()
        assert canvas.evaluate("el => el.getContext('2d').getImageData(270, 5, 1, 1).data[3]") == 0
        session = page.context.new_cdp_session(page)
        for event, points in [('touchStart', [(cx-30, cy), (cx+30, cy)]),
                              ('touchMove', [(cx-65, cy), (cx+65, cy)]),
                              ('touchEnd', [])]:
            session.send('Input.dispatchTouchEvent', {'type': event, 'touchPoints': [
                {'x': x, 'y': y, 'id': i} for i, (x, y) in enumerate(points)]})
        assert int(page.locator('#zoom').input_value()) > 100
        page.locator('#rotation').fill('45')
        expect(page.locator('#rotation-value')).to_have_text('45°')
        page.get_by_role('button', name='リセット').click()
        expect(page.locator('#rotation')).to_have_value('0')
        expect(page.locator('#zoom')).to_have_value('100')

        # Verify uniform photo scaling with a square drawn on a landscape PNG.
        first.click()
        expect(first).to_have_attribute('aria-pressed', 'true')
        landscape = Image.new('RGBA', (640, 480))
        ImageDraw.Draw(landscape).rectangle((280, 200, 359, 279), fill=(0, 255, 0, 128))
        buffer = io.BytesIO()
        landscape.save(buffer, 'PNG')
        uploader.set_input_files({'name': 'landscape.png', 'mimeType': 'image/png', 'buffer': buffer.getvalue()})
        expect(page.locator('#photo-status')).to_have_text('landscape.png')
        expect(save).to_be_enabled()
        output = download()
        assert output.getpixel((750, 750)) == (0, 255, 0, 128)
        assert output.getpixel((500, 750))[3] == 0
        bounds = output.getchannel('A').crop((500, 500, 1000, 1000)).getbbox()
        assert bounds is not None
        left, top, right, bottom = bounds
        assert right - left == bottom - top and abs(right - left - 250) <= 4

        # The same export dimensions apply at desktop preview widths.
        mobile_width = canvas.bounding_box()['width']
        page.set_viewport_size({'width': 1280, 'height': 900})
        assert canvas.bounding_box()['width'] > mobile_width
        desktop_logo = logo.bounding_box()
        assert desktop_logo['width'] > mobile_logo['width']
        assert abs(desktop_logo['width'] / desktop_logo['height'] - logo_ratio) < .03
        download()

        invalid = photo('PNG')
        invalid['buffer'] = b'not an image'
        uploader.set_input_files(invalid)
        expect(page.locator('#photo-status')).to_contain_text('有効な画像')
        invalid['buffer'] = photo('PNG')['buffer'][:24]
        uploader.set_input_files(invalid)
        expect(page.locator('#photo-status')).to_contain_text('破損')
        oversized = bytearray(photo('PNG')['buffer'][:24])
        oversized[16:20] = (15000).to_bytes(4, 'big')
        invalid['buffer'] = bytes(oversized)
        uploader.set_input_files(invalid)
        expect(page.locator('#photo-status')).to_contain_text('大きすぎます')
        network_requests = [request for request in requests if not request.url.startswith('blob:')]
        assert all(request.method == 'GET' and request.url.startswith(url) for request in network_requests)
        assert not errors, errors

        iphone = browser.new_page(
            viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True,
            user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/605.1.15',
        )
        iphone.add_init_script('''
            HTMLInputElement.prototype.showPicker = undefined;
            navigator.canShare = ({ files }) => !window.shareUnsupported && files.length === 1;
            navigator.share = async ({ files }) => {
              window.shareHadActivation = navigator.userActivation.isActive;
              if (window.rejectShare) throw new DOMException('Blocked', 'NotAllowedError');
              const [file] = files;
              const bitmap = await createImageBitmap(file);
              window.sharedImage = [file.name, file.type, bitmap.width, bitmap.height];
              bitmap.close();
            };
        ''')
        iphone.goto(url)
        with iphone.expect_file_chooser() as chooser:
            iphone.get_by_role('button', name='テスト レッド').tap()
        chooser.value.set_files([])
        with iphone.expect_file_chooser() as chooser:
            iphone.get_by_role('button', name='プレビューから写真を選ぶ').tap()
        chooser.value.set_files(photo('PNG'))
        iphone_save = iphone.get_by_role('button', name='画像を保存する！')
        expect(iphone_save).to_be_enabled()
        iphone_save.tap()
        iphone.wait_for_function('Array.isArray(window.sharedImage)')
        assert iphone.evaluate('window.sharedImage') == ['animals-icon.png', 'image/png', 1500, 1500]
        assert iphone.evaluate('window.shareHadActivation')
        iphone.evaluate('window.rejectShare = true')
        iphone_save.tap()
        fallback = iphone.get_by_role('button', name='画像を開いて保存')
        expect(fallback).to_be_visible()
        with iphone.expect_popup() as popup:
            fallback.tap()
        assert popup.value.url.startswith('blob:')
        popup.value.close()
        iphone.evaluate('window.shareUnsupported = true')
        iphone.get_by_role('button', name='リセット').tap()
        expect(iphone_save).to_be_enabled()
        with iphone.expect_popup() as popup:
            iphone_save.tap()
        assert popup.value.url.startswith('blob:')
        popup.value.close()
        iphone.close()

        extra_count = len(manifest())
        assert extra_count == 2
        renamed.unlink()
        assert len(manifest()) == 1
        (site / 'rings' / demo_file).unlink()
        assert manifest() == []
        page.reload()
        expect(page.locator('#ring-status')).to_contain_text('まだ登録されていません')
        expect(save).to_be_disabled()
        browser.close()
    server.shutdown()
    server.server_close()
print('PASS: manifest additions/renames/deletions, mobile UI, JPEG/PNG/WebP, composites, 1500px RGBA downloads at two viewport widths, drag, pinch, reset, invalid images, same-origin requests, empty state, native picker, simulated iPhone share and fallback')

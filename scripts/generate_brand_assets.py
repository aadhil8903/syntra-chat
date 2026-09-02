import os
from PIL import Image, ImageDraw

SVG_LOGO = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <defs>
    <linearGradient id="redGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ff4365" />
      <stop offset="100%" stop-color="#e11d48" />
    </linearGradient>
    <linearGradient id="redGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#e11d48" />
      <stop offset="100%" stop-color="#9f1239" />
    </linearGradient>
    <linearGradient id="redGradCore" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ff637e" />
      <stop offset="100%" stop-color="#e11d48" />
    </linearGradient>
    <linearGradient id="whiteGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="100%" stop-color="#e4e4e7" />
    </linearGradient>
    <filter id="brandGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="18" flood-color="#e11d48" flood-opacity="0.4" />
    </filter>
  </defs>

  <g filter="url(#brandGlow)">
    <!-- Top-Left Vibrant Red Facet -->
    <path d="M256 52 L108 168 L256 244 L256 128 Z" fill="url(#redGrad1)" />

    <!-- Top-Right Crisp Pure White Facet -->
    <path d="M256 52 L404 168 L256 244 L256 128 Z" fill="url(#whiteGrad)" />

    <!-- Bottom-Left Deep Crimson Facet -->
    <path d="M108 168 L108 332 L256 460 L256 280 Z" fill="url(#redGrad2)" />

    <!-- Bottom-Right Red Base Facet -->
    <path d="M404 168 L404 332 L256 460 L256 280 Z" fill="url(#redGrad1)" />

    <!-- Right-Side Floating White Prism -->
    <path d="M404 168 L332 224 L332 372 L404 332 Z" fill="url(#whiteGrad)" />

    <!-- Center Precision Floating Diamond (Red Core with White Border) -->
    <polygon points="256,164 324,256 256,348 188,256" fill="url(#redGradCore)" stroke="#ffffff" stroke-width="7" stroke-linejoin="round" />
  </g>
</svg>'''

def render_master_raster(size=2048):
    scale = size / 512.0
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    def S(pts):
        return [(p[0] * scale, p[1] * scale) for p in pts]

    c_red1 = (255, 67, 101, 255)
    c_red2 = (225, 29, 72, 255)
    c_red_dark = (159, 18, 57, 255)
    c_white = (255, 255, 255, 255)
    c_white_shade = (235, 235, 240, 255)
    c_red_core = (255, 80, 110, 255)

    draw.polygon(S([(256, 52), (108, 168), (256, 244), (256, 128)]), fill=c_red1)
    draw.polygon(S([(256, 52), (404, 168), (256, 244), (256, 128)]), fill=c_white)
    draw.polygon(S([(108, 168), (108, 332), (256, 460), (256, 280)]), fill=c_red_dark)
    draw.polygon(S([(404, 168), (404, 332), (256, 460), (256, 280)]), fill=c_red1)
    draw.polygon(S([(404, 168), (332, 224), (332, 372), (404, 332)]), fill=c_white_shade)
    draw.polygon(S([(256, 164), (324, 256), (256, 348), (188, 256)]), fill=c_red_core, outline=c_white, width=max(1, int(7 * scale)))

    return img

def main():
    svg_destinations = [
        'apps/frontend/public/assets/logo.svg',
        'apps/frontend/public/assets/logo-icon.svg',
        'apps/frontend/public/logo.svg',
        'apps/frontend/public/logo-icon.svg'
    ]
    for dest in svg_destinations:
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, 'w', encoding='utf-8') as f:
            f.write(SVG_LOGO)
        print(f'Wrote SVG: {dest}')

    master_img = render_master_raster(2048)

    sizes = [
        (512, 'apps/frontend/public/logo.png'),
        (512, 'apps/frontend/public/assets/logo.png'),
        (256, 'apps/frontend/public/logo-icon.png'),
        (256, 'apps/frontend/public/assets/logo-icon.png'),
        (512, 'apps/frontend/public/logo-full.png'),
        (512, 'logo.png')
    ]

    for target_size, path in sizes:
        parent_dir = os.path.dirname(path)
        if parent_dir:
            os.makedirs(parent_dir, exist_ok=True)
        resized = master_img.resize((target_size, target_size), Image.Resampling.LANCZOS)
        resized.save(path, format='PNG', optimize=True)
        print(f'Wrote PNG: {path}')

    ico_destinations = [
        'apps/frontend/public/favicon.ico',
        'apps/frontend/src/favicon.ico'
    ]
    ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    for ico_path in ico_destinations:
        parent_dir = os.path.dirname(ico_path)
        if parent_dir:
            os.makedirs(parent_dir, exist_ok=True)
        master_img.save(ico_path, format='ICO', sizes=ico_sizes)
        print(f'Wrote ICO: {ico_path}')

    print('Brand assets generation completed!')

if __name__ == '__main__':
    main()

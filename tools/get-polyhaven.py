#!/usr/bin/env python3
"""Download a Poly Haven model, texture or HDRI (CC0) for the game, by hand. Output is committed; nothing runs at build time.

  python3 tools/get-polyhaven.py model ID OUT.glb [pack-model.py options]   # the 1k glTF, packed by tools/pack-model.py
  python3 tools/get-polyhaven.py tex ID OUTBASE [--size 512] [--q 80]        # OUTBASE_diff.jpg and OUTBASE_nor.jpg
  python3 tools/get-polyhaven.py env ID OUT.png [--w 256] [--max 16]         # an HDRI for reflections, as an RGBM16 PNG

An env is the 1k .hdr, box-filtered down to --w by --w/2 and written as RGBM: rgb = colour / (a * max), a = the brightest
channel / max, so one 8-bit PNG carries light up to --max times white. three.js reads it with RGBM16Encoding
(vis/surface.js). Lights brighter than --max clip.

The raw download goes to a temporary folder and is deleted. Credit every file in the folder's CREDITS.md
(name, author, licence, URL: https://polyhaven.com/a/ID). Needs Python 3 with Pillow and numpy.
"""
import io, json, os, subprocess, sys, tempfile, urllib.request
from PIL import Image

API = "https://api.polyhaven.com"
UA = {"User-Agent": "Scrapline-asset-tool/1.0 (Longlight Interactive; https://scrapline.longlight.games/)"}


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()


def read_hdr(data):
    """A Radiance .hdr (RGBE, run-length scanlines) as a float array, height x width x 3, linear."""
    import numpy as np
    head, _, rest = data.partition(b"\n\n")
    line, _, body = rest.partition(b"\n")
    t = line.split()
    H, W = int(t[1]), int(t[3])
    out = np.zeros((H, W, 4), np.uint8)
    p = 0
    for y in range(H):
        if not (body[p] == 2 and body[p + 1] == 2):
            raise SystemExit("this .hdr is not run-length coded; not handled")
        p += 4
        for c in range(4):
            x = 0
            while x < W:
                n = body[p]
                p += 1
                if n > 128:
                    out[y, x:x + n - 128, c] = body[p]
                    p += 1
                    x += n - 128
                else:
                    out[y, x:x + n, c] = np.frombuffer(body, np.uint8, n, p)
                    p += n
                    x += n
    e = out[..., 3].astype(np.float32)
    return out[..., :3].astype(np.float32) * np.where(e > 0, np.exp2(e - 136.0), 0)[..., None]


def main():
    kind, aid, out = sys.argv[1], sys.argv[2], sys.argv[3]
    files = json.loads(get(API + "/files/" + aid))
    info = json.loads(get(API + "/info/" + aid))
    print("%s: %s by %s" % (aid, info.get("name"), ", ".join(info.get("authors", {}))))
    if kind == "model":
        g = files["gltf"]["1k"]["gltf"]
        with tempfile.TemporaryDirectory() as d:
            src = os.path.join(d, os.path.basename(g["url"]))
            open(src, "wb").write(get(g["url"]))
            for rel, f in g["include"].items():
                p = os.path.join(d, rel)
                os.makedirs(os.path.dirname(p), exist_ok=True)
                open(p, "wb").write(get(f["url"]))
            here = os.path.dirname(os.path.abspath(__file__))
            subprocess.check_call([sys.executable, os.path.join(here, "pack-model.py"), src, out] + sys.argv[4:])
    elif kind == "env":
        import numpy as np
        w = int(sys.argv[sys.argv.index("--w") + 1]) if "--w" in sys.argv else 256
        mx = float(sys.argv[sys.argv.index("--max") + 1]) if "--max" in sys.argv else 16.0
        rgb = read_hdr(get(files["hdri"]["1k"]["hdr"]["url"]))
        H, W = rgb.shape[:2]
        k = W // w
        rgb = rgb[:H - H % k, :W - W % k].reshape(H // k, k, W // k, k, 3).mean(axis=(1, 3))
        m = np.clip(rgb.max(axis=2) / mx, 1.0 / 255, 1.0)
        a = np.ceil(m * 255) / 255
        px = np.dstack([np.clip(rgb / (a[..., None] * mx), 0, 1), a])
        Image.fromarray(np.round(px * 255).astype("uint8"), "RGBA").save(out, "PNG", optimize=True)
        print("%s %dx%d, mean %.3f, peak %.1f (clips at %g)" % (out, px.shape[1], px.shape[0], rgb.mean(), rgb.max(), mx))
    else:
        size = int(sys.argv[sys.argv.index("--size") + 1]) if "--size" in sys.argv else 512
        q = int(sys.argv[sys.argv.index("--q") + 1]) if "--q" in sys.argv else 80
        for key, suf in (("Diffuse", "diff"), ("nor_gl", "nor")):
            pic = Image.open(io.BytesIO(get(files[key]["1k"]["jpg"]["url"]))).convert("RGB").resize((size, size), Image.LANCZOS)
            pic.save("%s_%s.jpg" % (out, suf), "JPEG", quality=q, optimize=True)
            print("%s_%s.jpg" % (out, suf))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Download a Poly Haven model or texture (CC0) for the game, by hand. Output is committed; nothing runs at build time.

  python3 tools/get-polyhaven.py model ID OUT.glb [pack-model.py options]   # the 1k glTF, packed by tools/pack-model.py
  python3 tools/get-polyhaven.py tex ID OUTBASE [--size 512] [--q 80]        # OUTBASE_diff.jpg and OUTBASE_nor.jpg

The raw download goes to a temporary folder and is deleted. Credit every file in the folder's CREDITS.md
(name, author, licence, URL: https://polyhaven.com/a/ID). Needs Python 3 with Pillow and numpy.
"""
import io, json, os, subprocess, sys, tempfile, urllib.request
from PIL import Image

API = "https://api.polyhaven.com"
UA = {"User-Agent": "Scrapline-asset-tool/1.0 (Longlight Interactive; https://scrapline.longlight.games/)"}


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()


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
    else:
        size = int(sys.argv[sys.argv.index("--size") + 1]) if "--size" in sys.argv else 512
        q = int(sys.argv[sys.argv.index("--q") + 1]) if "--q" in sys.argv else 80
        for key, suf in (("Diffuse", "diff"), ("nor_gl", "nor")):
            pic = Image.open(io.BytesIO(get(files[key]["1k"]["jpg"]["url"]))).convert("RGB").resize((size, size), Image.LANCZOS)
            pic.save("%s_%s.jpg" % (out, suf), "JPEG", quality=q, optimize=True)
            print("%s_%s.jpg" % (out, suf))


if __name__ == "__main__":
    main()

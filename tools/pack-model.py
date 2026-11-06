#!/usr/bin/env python3
"""Pack a downloaded glTF model (a .gltf + .bin + textures, as Poly Haven ships them) into one small .glb for the game.
Copied from Prairie Engine Works (Jxstrr0/350Chev, tools/pack-model.py); only the generator name and this line differ.

  python3 tools/pack-model.py IN.gltf OUT.glb [--tex 256] [--normal 128] [--q 78]

What it does, so a phone can afford the file:
  - textures shrink to --tex px (normal maps to --normal px) and are re-saved as JPEG at quality --q
  - vertex data is quantized with KHR_mesh_quantization (three.js r128's GLTFLoader reads it): positions to 16-bit,
    normals to 8-bit, UVs to 16-bit, indices to 16-bit; tangents, extra UV sets and skins are dropped
  - the size lands at about a third of the original vertex data plus the shrunken textures
Needs Python 3 with Pillow and numpy. Run by hand; the output goes in models/ and is committed. Credit every model in models/CREDITS.md.
"""
import io, json, os, struct, sys
import numpy as np
from PIL import Image

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def arg(name, d):
    return int(sys.argv[sys.argv.index(name) + 1]) if name in sys.argv else d


def main():
    src, out = sys.argv[1], sys.argv[2]
    tex, ntex, q = arg("--tex", 256), arg("--normal", 128), arg("--q", 78)
    base = os.path.dirname(os.path.abspath(src))
    g = json.load(open(src))
    bins = [open(os.path.join(base, b["uri"]), "rb").read() for b in g["buffers"]]

    def read(ai):
        a = g["accessors"][ai]
        bv = g["bufferViews"][a["bufferView"]]
        dt = np.dtype(CT[a["componentType"]])
        n, c = a["count"], NC[a["type"]]
        off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        st = bv.get("byteStride", dt.itemsize * c)
        raw = np.frombuffer(bins[bv["buffer"]], np.uint8, count=st * (n - 1) + dt.itemsize * c, offset=off)
        rows = np.lib.stride_tricks.as_strided(raw, (n, dt.itemsize * c), (st, 1))
        return np.ascontiguousarray(rows).view(dt).reshape(n, c)

    blob = bytearray()
    views, accs = [], []

    def push(arr, ctype, typ, target=None, normalized=False, mn=None, mx=None):
        while len(blob) % 4:
            blob.append(0)
        data = np.ascontiguousarray(arr)
        stride = None
        if data.ndim == 2 and data.itemsize * data.shape[1] % 4:   # vertex attributes must sit on 4-byte strides
            pad = 4 - data.itemsize * data.shape[1] % 4
            padded = np.zeros((data.shape[0], data.itemsize * data.shape[1] + pad), np.uint8)
            padded[:, : data.itemsize * data.shape[1]] = data.view(np.uint8).reshape(data.shape[0], -1)
            stride = padded.shape[1]
            data = padded
        v = {"buffer": 0, "byteOffset": len(blob), "byteLength": data.nbytes}
        if stride:
            v["byteStride"] = stride
        if target:
            v["target"] = target
        blob.extend(data.tobytes())
        views.append(v)
        a = {"bufferView": len(views) - 1, "componentType": ctype, "count": int(arr.shape[0]), "type": typ}
        if normalized:
            a["normalized"] = True
        if mn is not None:
            a["min"], a["max"] = mn, mx
        accs.append(a)
        return len(accs) - 1

    # ---- meshes: quantize per mesh, and move the de-quantize scale/offset onto a child node ----
    mesh_dq = {}
    for mi, m in enumerate(g["meshes"]):
        lo = np.full(3, np.inf)
        hi = np.full(3, -np.inf)
        for p in m["primitives"]:
            P = read(p["attributes"]["POSITION"]).astype(np.float64)
            lo, hi = np.minimum(lo, P.min(0)), np.maximum(hi, P.max(0))
        ctr, half = (lo + hi) / 2, np.maximum((hi - lo) / 2, 1e-9)
        mesh_dq[mi] = (ctr, half)
        for p in m["primitives"]:
            A = p["attributes"]
            na = {}
            P = (read(A["POSITION"]).astype(np.float64) - ctr) / half
            Pq = np.clip(np.round(P * 32767), -32767, 32767).astype(np.int16)
            na["POSITION"] = push(Pq, 5122, "VEC3", 34962, True, Pq.min(0).tolist(), Pq.max(0).tolist())
            if "NORMAL" in A:
                N = read(A["NORMAL"]).astype(np.float64) * half   # the node scale stretches normals by 1/half; pre-stretch
                N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
                na["NORMAL"] = push(np.round(N * 127).astype(np.int8), 5120, "VEC3", 34962, True)
            if "TEXCOORD_0" in A:
                T = read(A["TEXCOORD_0"]).astype(np.float64)
                if T.min() >= 0 and T.max() <= 1:
                    na["TEXCOORD_0"] = push(np.round(T * 65535).astype(np.uint16), 5123, "VEC2", 34962, True)
                else:
                    na["TEXCOORD_0"] = push(T.astype(np.float32), 5126, "VEC2", 34962)
            p["attributes"] = na
            if "indices" in p:
                I = read(p["indices"]).ravel()
                small = int(I.max()) < 65535
                p["indices"] = push(I.astype(np.uint16 if small else np.uint32), 5123 if small else 5125, "SCALAR", 34963)
            p.pop("targets", None)

    # ---- nodes: a node with a mesh keeps its transform; the mesh moves to a child that carries the de-quantize transform ----
    nodes = g["nodes"]
    for n in list(nodes):
        n.pop("skin", None)
        if "mesh" in n:
            ctr, half = mesh_dq[n["mesh"]]
            nodes.append({"mesh": n.pop("mesh"), "translation": ctr.tolist(), "scale": half.tolist()})
            n.setdefault("children", []).append(len(nodes) - 1)
    g.pop("skins", None)
    g.pop("animations", None)

    # ---- textures: shrink and re-save as JPEG ----
    normal_imgs = {g["textures"][m["normalTexture"]["index"]]["source"] for m in g.get("materials", []) if "normalTexture" in m}
    imgs = []
    for ii, im in enumerate(g.get("images", [])):
        pic = Image.open(os.path.join(base, im["uri"])).convert("RGB")
        side = ntex if ii in normal_imgs else tex
        pic = pic.resize((side, side), Image.LANCZOS)
        buf = io.BytesIO()
        pic.save(buf, "JPEG", quality=q, optimize=True)
        while len(blob) % 4:
            blob.append(0)
        views.append({"buffer": 0, "byteOffset": len(blob), "byteLength": len(buf.getvalue())})
        blob.extend(buf.getvalue())
        imgs.append({"bufferView": len(views) - 1, "mimeType": "image/jpeg"})
    if imgs:
        g["images"] = imgs
    for m in g.get("materials", []):
        m.pop("extensions", None)   # Poly Haven adds KHR_materials_* the game does not need

    while len(blob) % 4:
        blob.append(0)
    g["accessors"], g["bufferViews"] = accs, views
    g["buffers"] = [{"byteLength": len(blob)}]
    g["extensionsUsed"] = ["KHR_mesh_quantization"]
    g["extensionsRequired"] = ["KHR_mesh_quantization"]
    g.setdefault("asset", {})["generator"] = "Scrapline tools/pack-model.py (from Prairie Engine Works)"
    js = json.dumps(g, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    glb = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob))
    glb += struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(blob), 0x004E4942) + bytes(blob)
    open(out, "wb").write(glb)
    print("%s  %d KB" % (out, len(glb) // 1024))


if __name__ == "__main__":
    main()

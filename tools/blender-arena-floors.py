#!/usr/bin/env python3
"""Bake the arena floors (textures/floor-*.webp) in Blender from code. Original work for Scrapline (Longlight Interactive).

  python3 -m venv /tmp/bvenv && /tmp/bvenv/bin/pip install bpy pillow     # Blender as a Python module (bpy 5.x), Pillow
  /tmp/bvenv/bin/python tools/blender-arena-floors.py textures            # writes floor-<look>_diff / _nor / _orm .webp

One tile per arena look (vis/arena.js ARENA_LOOK; vis/props.js FLOOR_TEX). A tile is 2.4 arena scene units square (60 cm
at beetle scale, two squares of the old painted grid) and repeats, so every edge matches the opposite edge:
  deck   the league's own floor: four bolted steel panels, painted, with chamfered edges, countersunk screws, an access
         cap and a pair of lifting slots; the paint is chipped at the edges and scratched down to the steel
  mill   Stahlbrück: two heavy plates in a brick bond, welded (a bead of weld along every seam, spatter beside it, plug
         welds in the plates), mill scale, the blue and straw of heat beside the welds, rust in the low spots
  port   Eisenau: a quay's timber deck, six planks with butt joints, coach bolts at the joints, grain, damp patches
  shed   Grauwald: cast concrete in four bays, tooled joints, anchor sockets, pitting, a crack, oil soaked in
How: the tile is modelled as real geometry, laid out three by three so the edges see their neighbours, and rendered
straight down with an orthographic camera in Cycles, one pass at a time, every surface an emitter (so no lights and no
noise): the surface normal, ambient occlusion, height, and a mask (red: bare metal, green: a shade per piece, blue: a
second mask per floor). numpy then lays the wear over those passes with noise made in the frequency domain, which
repeats by construction, and writes three WebP files a floor (a third the size of the same picture as a JPEG):
  _diff   colour (sRGB). The game scales it so its average is the look's coded colour (as it does the photo textures).
  _nor    tangent-space normal, +y up (OpenGL, three.js): red along the tile's x, green along its y
  _orm    green roughness, blue metalness (red is the occlusion, unused): three.js reads both from one texture
Nothing random at run time: fixed seeds here, and the files are committed.
"""
import math, os, random, sys
import bpy
import numpy as np
from PIL import Image, ImageDraw

OUT = sys.argv[-1] if os.path.isdir(sys.argv[-1]) else "/tmp/floors"
ONLY = os.environ.get("ONLY", "").split(",") if os.environ.get("ONLY") else None
RES = int(os.environ.get("RES", "1024"))
T = 2.4                      # the tile, in arena scene units
PX = T / RES                 # units a pixel
TMP = os.path.join(os.environ.get("TMPDIR", "/tmp"), "floor-pass")
os.makedirs(TMP, exist_ok=True)
os.makedirs(OUT, exist_ok=True)
ZLO, ZHI = -0.08, 0.04       # the height pass maps this range to 0..1


# ---------------------------------------------------------------- Blender: the scene, the pieces, the passes
def scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.use_denoising = False
    sc.render.resolution_x = sc.render.resolution_y = RES
    sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = "Raw"      # the passes are data: write the numbers as they are
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGB"
    sc.render.image_settings.color_depth = "16"
    cam = bpy.data.cameras.new("cam")
    cam.type = "ORTHO"
    cam.ortho_scale = T
    cam.clip_start, cam.clip_end = 0.1, 50
    o = bpy.data.objects.new("cam", cam)
    sc.collection.objects.link(o)
    o.location = (T / 2, T / 2, 10)              # looks straight down, +y up the picture
    sc.camera = o
    return sc


def nodes(name):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    nt.nodes.clear()
    e = nt.nodes.new("ShaderNodeEmission")
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(e.outputs[0], o.inputs["Surface"])
    return m, nt, e


_emit = {}


def emit(r, g, b):
    """a mask colour: red bare metal, green a shade for the piece, blue the floor's own second mask"""
    k = (round(r, 3), round(g, 3), round(b, 3))
    if k not in _emit:
        m, nt, e = nodes("m%d" % len(_emit))
        e.inputs["Color"].default_value = (k[0], k[1], k[2], 1)
        _emit[k] = m
    return _emit[k]


def m_normal():
    m, nt, e = nodes("pass-normal")
    g = nt.nodes.new("ShaderNodeNewGeometry")
    v = nt.nodes.new("ShaderNodeVectorMath")
    v.operation = "MULTIPLY_ADD"
    v.inputs[1].default_value = (0.5, 0.5, 0.5)
    v.inputs[2].default_value = (0.5, 0.5, 0.5)
    nt.links.new(g.outputs["Normal"], v.inputs[0])
    nt.links.new(v.outputs[0], e.inputs["Color"])
    return m


def m_ao(dist):
    m, nt, e = nodes("pass-ao")
    a = nt.nodes.new("ShaderNodeAmbientOcclusion")
    a.samples = 6
    a.inputs["Distance"].default_value = dist
    nt.links.new(a.outputs["AO"], e.inputs["Color"])
    return m


def m_height():
    m, nt, e = nodes("pass-height")
    g = nt.nodes.new("ShaderNodeNewGeometry")
    s = nt.nodes.new("ShaderNodeSeparateXYZ")
    r = nt.nodes.new("ShaderNodeMapRange")
    r.inputs["From Min"].default_value = ZLO
    r.inputs["From Max"].default_value = ZHI
    nt.links.new(g.outputs["Position"], s.inputs[0])
    nt.links.new(s.outputs["Z"], r.inputs["Value"])
    nt.links.new(r.outputs[0], e.inputs["Color"])
    return m


def sel(*objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def smooth(o, deg=40):
    for p in o.data.polygons:
        p.use_smooth = True
    sel(o)
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(deg))
    except Exception:
        pass
    return o


PARTS = []


def keep(o, m):
    o.data.materials.append(m)
    PARTS.append(o)
    return o


def box(x0, y0, x1, y1, z0, z1, m, bev=0.0, seg=1):
    bpy.ops.mesh.primitive_cube_add(size=1, location=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    o = bpy.context.object
    o.scale = (x1 - x0, y1 - y0, z1 - z0)
    bpy.ops.object.transform_apply(scale=True)
    if bev:
        b = o.modifiers.new("b", "BEVEL")
        b.width, b.segments, b.limit_method = bev, seg, "ANGLE"
        bpy.ops.object.modifier_apply(modifier=b.name)
        if seg > 1:
            smooth(o, 50)
    return keep(o, m)


def cone(x, y, z0, z1, r0, r1, m, n=28):
    """a round piece: radius r0 at the bottom (z0), r1 at the top (z1)"""
    bpy.ops.mesh.primitive_cone_add(vertices=n, radius1=r0, radius2=r1, depth=z1 - z0, location=(x, y, (z0 + z1) / 2))
    return keep(smooth(bpy.context.object, 35), m)


def dome(x, y, z, r, h, m, n=16):
    """a squashed ball: radius r in the floor, h tall, its middle at z"""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=n, ring_count=max(6, n // 2), radius=1, location=(x, y, z))
    o = bpy.context.object
    o.scale = (r, r, h)
    bpy.ops.object.transform_apply(scale=True)
    return keep(smooth(o, 80), m)


def prism(x, y, z0, z1, r, sides, m, turn=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=sides, radius=r, depth=z1 - z0, location=(x, y, (z0 + z1) / 2), rotation=(0, 0, turn))
    return keep(bpy.context.object, m)


def cut(target, cutters):
    """target minus every cutter (one boolean)"""
    for c in cutters:
        PARTS.remove(c)
    sel(*cutters)
    if len(cutters) > 1:
        bpy.ops.object.join()
    c = bpy.context.object
    b = target.modifiers.new("c", "BOOLEAN")
    b.operation, b.object, b.solver = "DIFFERENCE", c, "EXACT"
    sel(target)
    bpy.ops.object.modifier_apply(modifier=b.name)
    bpy.data.objects.remove(c, do_unlink=True)
    return target


def passes(name, ao_dist):
    """join the pieces, lay them out three by three and render the four passes; returns them as arrays, top row first"""
    sc = bpy.context.scene
    sel(*PARTS)
    bpy.ops.object.join()
    o = bpy.context.object
    PARTS.clear()
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            if dx or dy:
                d = o.copy()                      # shares the mesh
                d.location = (dx * T, dy * T, 0)
                sc.collection.objects.link(d)
    out = {}
    for key, over, spp in (("mask", None, 24), ("nor", m_normal(), 24), ("hgt", m_height(), 24), ("ao", m_ao(ao_dist), 40)):
        bpy.context.view_layer.material_override = over
        sc.cycles.samples = spp
        sc.render.filepath = os.path.join(TMP, "%s-%s.png" % (name, key))
        bpy.ops.render.render(write_still=True)
        im = bpy.data.images.load(sc.render.filepath)
        im.colorspace_settings.name = "Non-Color"
        a = np.empty(RES * RES * 4, np.float32)
        im.pixels.foreach_get(a)
        out[key] = a.reshape(RES, RES, 4)[::-1, :, :3].astype(np.float64)
        bpy.data.images.remove(im)
    out["ao"] = out["ao"][:, :, 0]
    out["hgt"] = out["hgt"][:, :, 0] * (ZHI - ZLO) + ZLO
    return out


# ---------------------------------------------------------------- numpy: noise that repeats, marks, the three maps
def fnoise(seed, beta=2.0, ax=1.0, ay=1.0, lo=0.0, hi=0.0):
    """noise with a 1/f^beta spectrum, zero mean and unit spread; periodic, as it is built from its frequencies.
    ax, ay stretch the frequencies (ax 8 gives streaks along x); lo and hi cut frequencies (cycles a tile) outside them"""
    w = np.random.default_rng(seed).standard_normal((RES, RES))
    fx = np.fft.fftfreq(RES)[None, :] * RES * ax
    fy = np.fft.fftfreq(RES)[:, None] * RES * ay
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1
    s = f ** (-beta / 2)
    if lo:
        s *= f >= lo
    if hi:
        s *= f <= hi
    s[0, 0] = 0
    a = np.real(np.fft.ifft2(np.fft.fft2(w) * s))
    return (a - a.mean()) / a.std()


def blur(a, sigma):
    """a Gaussian blur that wraps round the tile (sigma in pixels)"""
    fx = np.fft.fftfreq(RES)[None, :]
    fy = np.fft.fftfreq(RES)[:, None]
    return np.real(np.fft.ifft2(np.fft.fft2(a) * np.exp(-2 * (math.pi * sigma) ** 2 * (fx * fx + fy * fy))))


def sat(a):
    return np.clip(a, 0, 1)


def step(a, lo, hi):
    t = sat((a - lo) / (hi - lo))
    return t * t * (3 - 2 * t)


def strokes(seed, n, length, width, alpha=(0.4, 1.0), angle=None, spread=math.pi, curve=0.0):
    """n marks drawn across the tile, wrapping at its edges: a 0..1 picture (lengths and widths in pixels)"""
    r = random.Random(seed)
    S = 2                                           # drawn at twice the size and scaled down, for soft edges
    im = Image.new("L", (RES * S, RES * S), 0)
    d = ImageDraw.Draw(im)
    for _ in range(n):
        a = (r.random() * 2 * math.pi) if angle is None else angle + (r.random() - 0.5) * spread
        L = r.uniform(*length) if isinstance(length, tuple) else length
        w = r.uniform(*width) if isinstance(width, tuple) else width
        x, y = r.random() * RES, r.random() * RES
        k = r.uniform(-curve, curve)
        pts = []
        for i in range(13):
            t = i / 12 - 0.5
            aa = a + k * t
            pts.append((x + math.cos(aa) * L * t, y + math.sin(aa) * L * t))
        v = int(255 * r.uniform(*alpha))
        for ox in (-RES, 0, RES):
            for oy in (-RES, 0, RES):
                d.line([((px + ox) * S, (py + oy) * S) for px, py in pts], fill=v, width=max(1, int(round(w * S))), joint="curve")
    return np.asarray(im.resize((RES, RES), Image.LANCZOS), np.float64) / 255


def spots(seed, n, radius, alpha=(0.5, 1.0)):
    """n round marks (radius in pixels), wrapping"""
    r = random.Random(seed)
    S = 2
    im = Image.new("L", (RES * S, RES * S), 0)
    d = ImageDraw.Draw(im)
    for _ in range(n):
        x, y, q = r.random() * RES, r.random() * RES, r.uniform(*radius)
        v = int(255 * r.uniform(*alpha))
        for ox in (-RES, 0, RES):
            for oy in (-RES, 0, RES):
                d.ellipse([(x + ox - q) * S, (y + oy - q) * S, (x + ox + q) * S, (y + oy + q) * S], fill=v)
    return np.asarray(im.resize((RES, RES), Image.LANCZOS), np.float64) / 255


def rgb(h):
    return np.array([(h >> 16) & 255, (h >> 8) & 255, h & 255], np.float64) / 255


def mix(a, b, t):
    """a to b by t; colours are 3 long, pictures RES x RES (x 3)"""
    a = np.asarray(a, np.float64)
    b = np.asarray(b, np.float64)
    if a.ndim == 1:
        a = a[None, None, :]
    if b.ndim == 1:
        b = b[None, None, :]
    if np.ndim(t) == 2 and (a.ndim == 3 or b.ndim == 3):
        t = t[:, :, None]
    return a + (b - a) * t


def slopes(h):
    """the slope of a height field (units): d/dx along the picture, d/dy up it"""
    return (np.roll(h, -1, 1) - np.roll(h, 1, 1)) / (2 * PX), -(np.roll(h, -1, 0) - np.roll(h, 1, 0)) / (2 * PX)


def write(name, P, colour, height, rough, metal):
    """the three maps: the baked normal with the drawn height's slope added, the colour times the occlusion"""
    n = P["nor"] * 2 - 1
    nz = np.maximum(n[:, :, 2], 0.2)
    sx, sy = -n[:, :, 0] / nz, -n[:, :, 1] / nz
    dx, dy = slopes(height)
    sx, sy = np.clip(sx + dx, -3, 3), np.clip(sy + dy, -3, 3)
    ln = np.sqrt(sx * sx + sy * sy + 1)
    nor = np.stack([-sx / ln, -sy / ln, 1 / ln], 2) * 0.5 + 0.5
    ao = sat(P["ao"])
    col = sat(colour * (0.35 + 0.65 * ao)[:, :, None])
    orm = np.stack([ao, sat(rough), sat(metal)], 2)
    for key, a, q in (("diff", col, 80), ("nor", nor, 80), ("orm", orm, 80)):
        im = Image.fromarray((sat(a) * 255 + 0.5).astype(np.uint8), "RGB")
        if key == "orm" and RES > 512:
            im = im.resize((RES // 2, RES // 2), Image.LANCZOS)       # roughness and metalness carry at half size
        im.save(os.path.join(OUT, "floor-%s_%s.webp" % (name, key)), quality=q, method=6)
    print(name, "mean colour", [round(float(v), 3) for v in col.reshape(-1, 3).mean(0)], "mean rough", round(float(orm[:, :, 1].mean()), 3))


# ---------------------------------------------------------------- deck: bolted steel panels, painted
def deck():
    scene()
    r = random.Random(42)
    G, CH, P = 0.014, 0.016, 1.2                 # the gap between panels, the chamfer, a panel
    box(-0.1, -0.1, T + 0.1, T + 0.1, -0.09, -0.04, emit(0, 0, 1))           # what shows down the gaps
    for i in range(2):
        for j in range(2):
            x0, y0, lift = i * P, j * P, r.uniform(-0.003, 0.002)
            pl = box(x0 + G / 2, y0 + G / 2, x0 + P - G / 2, y0 + P - G / 2, -0.07, lift, emit(0, 0.25 + 0.5 * r.random(), 0), CH)
            cs, heads = [], []
            ins = 0.1
            at = [(x0 + ins, y0 + ins), (x0 + P - ins, y0 + ins), (x0 + ins, y0 + P - ins), (x0 + P - ins, y0 + P - ins),
                  (x0 + P / 2, y0 + ins), (x0 + P / 2, y0 + P - ins), (x0 + ins, y0 + P / 2), (x0 + P - ins, y0 + P / 2)]
            for (x, y) in at:                    # countersunk screws: a cone cut in the panel, the head a hair under it
                cs.append(cone(x, y, lift - 0.02, lift + 0.001, 0.014, 0.036, emit(0, 0, 0)))
                hd = cone(x, y, lift - 0.02, lift - 0.003, 0.014, 0.031, emit(1, 0.5, 0))
                heads.append((hd, prism(x, y, lift - 0.012, lift, 0.014, 6, emit(0, 0, 0), r.random() * 3)))
            if (i, j) == (1, 0):                 # an access cap: a ring cut round a disc, two pin holes
                cx, cy = x0 + P / 2, y0 + P / 2
                cs.append(cone(cx, cy, lift - 0.008, lift + 0.001, 0.132, 0.14, emit(0, 0, 0), 48))
                cap = prism(cx, cy, lift - 0.02, lift - 0.002, 0.124, 48, emit(0, 0.45, 0))     # flat shaded: its top stays flat round the holes
                cut(cap, [prism(cx - 0.06, cy, lift - 0.012, lift, 0.012, 12, emit(0, 0, 0)), prism(cx + 0.06, cy, lift - 0.012, lift, 0.012, 12, emit(0, 0, 0))])
            if (i, j) == (0, 1):                 # a pair of lifting slots
                for sx in (-0.16, 0.16):
                    cs.append(box(x0 + P / 2 + sx - 0.06, y0 + P / 2 - 0.016, x0 + P / 2 + sx + 0.06, y0 + P / 2 + 0.016, lift - 0.03, lift + 0.001, emit(0, 0, 1), 0.012, 3))
            cut(pl, cs)
            for hd, hx in heads:
                cut(hd, [hx])
    p = passes("deck", 0.06)
    M = p["mask"]
    steel, shade, hole = M[:, :, 0], M[:, :, 1], M[:, :, 2]
    paintable = (1 - step(steel, 0.3, 0.7)) * (1 - step(hole, 0.3, 0.7))
    chamfer = step(1 - p["nor"][:, :, 2], 0.03, 0.12) * paintable            # the sloped edges
    near = sat(blur(chamfer, 7) * 3.2)                                       # how close to an edge
    n1, n2, n3 = fnoise(1, 2.2), fnoise(2, 2.4, lo=7, hi=110), fnoise(3, 0.6, lo=40)
    chips = step(n2 * 0.8 + near * 2.5 - 2.05, 0, 0.3) * paintable           # paint gone, mostly at the edges
    fine = strokes(11, 240, (10, 60), (0.5, 0.9), (0.15, 0.6))               # hairline scratches, every way
    drag = strokes(12, 13, (50, 190), (1.0, 2.0), (0.4, 0.9), curve=0.5)     # gouges down to the steel
    arcs = blur(strokes(13, 4, (200, 420), (9, 18), (0.4, 0.7), curve=1.6), 3.5) * step(fnoise(4, 1.5, lo=8), -0.4, 0.8)   # tyre rubber
    bare = sat(np.maximum(chips, np.maximum(drag * 1.2, fine * 0.55)) * paintable + steel)
    grime = step(n1, -1.4, 1.6)
    paint = mix(rgb(0x4d4e50), rgb(0x3b3c3e), grime)
    paint = paint * (0.9 + 0.2 * shade[:, :, None]) * (1 + 0.035 * n3[:, :, None])
    paint = mix(paint, rgb(0x191817), sat(arcs * 0.8) * paintable)
    metal_c = mix(rgb(0x6c7076), rgb(0x8a8e94), step(fnoise(5, 1.0, ax=6, lo=20), -1, 1))    # steel that has sat bare: dull
    metal_c = mix(metal_c, rgb(0xb4b9bf), sat(drag * 1.2 + steel)[:, :, None])               # fresh gouges and the screws: bright
    metal_c = mix(metal_c, rgb(0x5a4a3c), step(fnoise(6, 2.0), 0.4, 1.8) * 0.5)      # a little rust on bare steel
    col = mix(paint, metal_c, bare)
    col = mix(col, rgb(0x0c0c0c), step(hole, 0.3, 0.7))
    col = col * (1 - 0.25 * sat(blur(step(hole, 0.3, 0.7), 3) * 2 - step(hole, 0.3, 0.7))[:, :, None])   # dirt beside the gaps
    hgt = -0.0035 * drag - 0.0012 * fine - 0.0016 * chips + 0.00014 * n3 * paintable + 0.0012 * blur(arcs, 2)
    rough = mix(0.62 + 0.1 * grime, 0.34 + 0.1 * step(n2, -1, 1), bare)
    rough = rough + 0.25 * sat(arcs) * paintable
    rough = mix(rough, 0.9, step(hole, 0.3, 0.7))
    write("deck", p, col, hgt, rough, bare * (1 - step(hole, 0.3, 0.7)))


# ---------------------------------------------------------------- mill: heavy plate, welded
def mill():
    scene()
    r = random.Random(7)
    P = 1.2
    box(-0.1, -0.1, T + 0.1, T + 0.1, -0.09, -0.012, emit(0, 0, 1))
    seams = []                                    # (x0, y0, x1, y1) of every weld
    for j in range(2):
        off = j * P                               # the second row sits half a plate along (it wraps)
        y0 = j * P
        box(off + 0.012, y0 + 0.012, off + T - 0.012, y0 + P - 0.012, -0.07, r.uniform(-0.002, 0.002), emit(0, 0.3 + 0.4 * r.random(), 0), 0.012)
        box(off - T + 0.012, y0 + 0.012, off - 0.012, y0 + P - 0.012, -0.07, r.uniform(-0.002, 0.002), emit(0, 0.3 + 0.4 * r.random(), 0), 0.012)
        seams.append((0, y0, T, y0))
        seams.append((off % T, y0, off % T, y0 + P))
        for k in range(4):                        # plug welds through the plate to the frame under it
            x, y = (off + 0.3 + 0.6 * k) % T, y0 + (0.3 if k % 2 else 0.9)
            dome(x, y, -0.001, 0.05, 0.007, emit(1, 0.7, 0), 20)
            for q in range(9):
                a = q * 0.7
                dome(x + math.cos(a) * 0.03, y + math.sin(a) * 0.03, 0.001, 0.02, 0.005, emit(1, 0.75, 0), 10)
    for (x0, y0, x1, y1) in seams:                # the bead: a row of overlapping puddles, laid one on the last
        L = math.hypot(x1 - x0, y1 - y0)
        n = int(L / 0.017)
        for i in range(n):
            t = (i + 0.5) / n
            wob = 0.004 * math.sin(i * 0.37) + r.uniform(-0.002, 0.002)
            nx, ny = (y1 - y0) / L, -(x1 - x0) / L
            x, y = x0 + (x1 - x0) * t + nx * wob, y0 + (y1 - y0) * t + ny * wob
            dome(x, y, -0.004, 0.026 + r.uniform(-0.003, 0.003), 0.013 + r.uniform(-0.002, 0.002), emit(1, 0.9, 1), 10)
        for _ in range(int(L * 34)):              # spatter: beads of weld thrown clear
            t, d = r.random(), r.choice((-1, 1)) * r.uniform(0.035, 0.16)
            nx, ny = (y1 - y0) / L, -(x1 - x0) / L
            dome(x0 + (x1 - x0) * t + nx * d, y0 + (y1 - y0) * t + ny * d, 0.0, r.uniform(0.004, 0.009), r.uniform(0.003, 0.006), emit(1, 0.6, 0), 8)
    p = passes("mill", 0.07)
    M = p["mask"]
    weld, shade, bead = step(M[:, :, 0], 0.3, 0.7), M[:, :, 1], step(M[:, :, 2] * M[:, :, 0], 0.3, 0.7)
    gap = step(M[:, :, 2] * (1 - M[:, :, 0]), 0.3, 0.7)
    heat = sat(blur(bead, 16) * 5.5)             # the heat-affected band either side of a bead
    n1, n2, n3 = fnoise(21, 2.4), fnoise(22, 1.4, lo=5), fnoise(23, 0.5, lo=50)
    scale = mix(rgb(0x3d4046), rgb(0x55585e), step(n1 * 0.7 + n2 * 0.5, -1.2, 1.2))      # mill scale: blue-black, blotchy
    scale = scale * (0.92 + 0.16 * shade[:, :, None]) * (1 + 0.015 * n3[:, :, None])
    flake = step(n2 + 0.25 * n3, 1.25, 1.6)                                               # scale flaked off: brighter steel
    scale = mix(scale, rgb(0x7c7f84), flake * 0.8)
    band = heat * (1 + 0.12 * n2)                                                        # straw, purple, blue, out from the weld
    tint = mix(rgb(0x4a5a80), rgb(0x6a4a78), step(band, 0.2, 0.45))
    tint = mix(tint, rgb(0x9a7a40), step(band, 0.45, 0.75))
    tint = mix(tint, rgb(0x8a8c90), step(band, 0.8, 1.0))
    col = mix(scale, tint, step(band, 0.06, 0.25) * 0.62)
    rust = step(fnoise(24, 2.2) + 0.3 * n2 + 2.0 * sat(blur(gap, 5) * 3), 1.7, 2.5)
    col = mix(col, mix(rgb(0x6b3d22), rgb(0x8a5a30), step(n3, -1, 1)), rust * 0.75)
    col = mix(col, mix(rgb(0x8f9399), rgb(0x6e7278), step(n2, -1, 1)), weld)             # the weld metal itself
    fine = strokes(31, 200, (14, 80), (0.6, 1.0), (0.15, 0.6))
    drag = strokes(32, 14, (60, 220), (1.1, 2.2), (0.4, 0.9), curve=0.4)
    col = mix(col, rgb(0xb4b8be), sat(drag + fine * 0.5) * (1 - weld) * 0.85)
    col = mix(col, rgb(0x0b0a0a), gap)
    hgt = -0.004 * drag - 0.0012 * fine + 0.00015 * n3 * (1 - weld) - 0.0018 * blur(flake, 1.2) + 0.002 * step(n1, -2, 2)
    rough = 0.58 + 0.14 * step(n1, -1, 1) - 0.2 * flake - 0.26 * sat(drag + fine * 0.5) + 0.3 * rust
    rough = mix(rough, 0.42, weld)
    metal = sat(1 - 0.75 * rust) * (1 - gap)
    write("mill", p, col, hgt, rough, metal)


# ---------------------------------------------------------------- port: a timber deck
def port():
    scene()
    r = random.Random(19)
    N, G = 6, 0.014
    W = T / N
    box(-0.1, -0.1, T + 0.1, T + 0.1, -0.12, -0.05, emit(0, 0, 1))
    for j in range(N):
        y0 = j * W
        cutx = (0.35 + j * 0.95 + r.uniform(-0.1, 0.1)) % T      # this row's butt joint
        lift = r.uniform(-0.005, 0.003)
        for (a, b) in ((cutx + G / 2, cutx + T - G / 2), (cutx - T + G / 2, cutx - G / 2)):
            box(a, y0 + G / 2, b, y0 + W - G / 2, -0.07, lift, emit(0, 0.15 + 0.7 * r.random(), 0), 0.014, 3)
        for side in (-1, 1):                      # coach bolts either side of the joint
            for yy in (y0 + W * 0.27, y0 + W * 0.73):
                x = (cutx + side * 0.09) % T
                dome(x, yy, lift - 0.002, 0.026, 0.011, emit(1, 0.5, 0), 16)
    p = passes("port", 0.05)
    M = p["mask"]
    bolt, shade, gap = step(M[:, :, 0], 0.3, 0.7), M[:, :, 1], step(M[:, :, 2], 0.3, 0.7)
    g1 = fnoise(41, 2.0, ax=10)                   # long grain along the planks
    g2 = fnoise(42, 1.6, ax=14, lo=8, hi=220)     # fine grain
    g3 = fnoise(43, 0.6, lo=60)
    rows = (np.arange(RES)[:, None] / RES * N).astype(int) % N
    shift = np.array([random.Random(100 + k).uniform(-1, 1) for k in range(N)])[rows]    # each plank its own cut of wood
    tone = sat(0.5 + 0.22 * g1 + 0.12 * g2 + 0.3 * (shade - 0.5) + 0.08 * shift)
    wood = mix(rgb(0x4c443c), rgb(0x8b8073), tone)                                       # weathered: grey over brown
    wood = mix(wood, rgb(0x6b5a45), step(fnoise(44, 2.2), 0.2, 1.6)[:, :, None] * 0.5)   # browner where it is less bleached
    wood = wood * (1 + 0.012 * g3[:, :, None])
    damp = step(fnoise(45, 2.8) + 0.12 * g2, 0.6, 1.9)                                   # wet patches: darker, shinier
    wood = wood * (1 - 0.3 * damp[:, :, None])
    cracks = strokes(51, 46, (40, 220), (0.8, 1.6), (0.5, 1.0), angle=0.0, spread=0.05)  # checks along the grain
    scuff = strokes(52, 110, (10, 50), (0.6, 1.0), (0.15, 0.5))
    drag = strokes(53, 10, (50, 200), (1.2, 2.4), (0.4, 0.9), curve=0.5)                 # gouges: pale fresh wood
    wood = mix(wood, rgb(0x241f1b), cracks * 0.8)
    wood = mix(wood, rgb(0x9a8a72), sat(drag * 0.7 + scuff * 0.25))
    rustc = mix(rgb(0x4a372b), rgb(0x5f5f62), step(g3, -0.5, 1.2))
    stain = sat(blur(bolt, 6) * 2.4) * (1 - bolt)                                        # rust weeping from the bolts
    col = mix(wood, rgb(0x4a3526), stain * 0.55)
    col = mix(col, rustc, bolt)
    col = mix(col, rgb(0x090807), gap)
    hgt = 0.0007 * g2 + 0.0006 * g1 - 0.004 * cracks - 0.0035 * drag - 0.001 * scuff
    rough = 0.84 - 0.36 * damp
    rough = mix(rough, 0.62, bolt)
    write("port", p, col, hgt * (1 - bolt), rough, bolt * 0.6)


# ---------------------------------------------------------------- shed: cast concrete
def shed():
    scene()
    r = random.Random(3)
    P, G = 1.2, 0.012
    box(-0.1, -0.1, T + 0.1, T + 0.1, -0.1, -0.022, emit(0, 0, 1))
    for i in range(2):
        for j in range(2):
            x0, y0 = i * P, j * P
            sl = box(x0 + G / 2, y0 + G / 2, x0 + P - G / 2, y0 + P - G / 2, -0.07, 0.0, emit(0, 0.2 + 0.6 * r.random(), 0), 0.02, 3)
            cs = []
            for (x, y) in ((x0 + 0.22, y0 + 0.22), (x0 + P - 0.22, y0 + P - 0.22)):     # anchor sockets cast into each bay
                cs.append(cone(x, y, -0.03, 0.001, 0.034, 0.034, emit(0, 0, 0), 24))
                cone(x, y, -0.03, -0.002, 0.033, 0.033, emit(1, 0.5, 0), 24)
                cut(PARTS[-1], [cone(x, y, -0.02, 0.0, 0.017, 0.019, emit(0, 0, 0), 16)])
            cut(sl, cs)
    p = passes("shed", 0.05)
    M = p["mask"]
    iron, shade, gap = step(M[:, :, 0], 0.3, 0.7), M[:, :, 1], step(M[:, :, 2], 0.3, 0.7)
    n1, n2, n3 = fnoise(61, 2.6), fnoise(62, 1.5, lo=4), fnoise(63, 0.4, lo=70)
    trowel = fnoise(64, 1.6, ax=5, ay=1.4, lo=3)                                         # the float's sweep
    base = mix(rgb(0x5d5d57), rgb(0x86867d), step(n1 * 0.6 + n2 * 0.4 + trowel * 0.3, -1.6, 1.6))
    base = base * (0.93 + 0.14 * shade[:, :, None])
    speck = step(n3, 1.3, 2.0)                                                           # aggregate showing: light and dark flecks
    speck2 = step(-n3, 1.4, 2.1)
    base = mix(base, rgb(0xa7a59a), speck * 0.35)
    base = mix(base, rgb(0x3a3a36), speck2 * 0.35)
    pits = step(fnoise(65, 0.2, lo=30, hi=160), 2.1, 2.6)                                # blow holes
    oil = step(fnoise(66, 2.8) + 0.12 * n2, 1.0, 1.9)                                    # oil soaked in: dark, a little shiny
    base = base * (1 - 0.4 * oil[:, :, None])
    crack = strokes(71, 5, (260, 620), (1.0, 1.8), (0.7, 1.0), curve=2.2)
    crack = np.maximum(crack, strokes(72, 14, (60, 160), (0.7, 1.2), (0.5, 0.9), curve=2.6))
    wheel = blur(strokes(73, 8, (240, 560), (9, 18), (0.4, 0.8), curve=1.2), 3) * step(fnoise(67, 1.5, lo=8), -0.7, 0.5)   # tyre marks
    scuff = strokes(74, 190, (12, 70), (0.6, 1.2), (0.2, 0.7))
    col = mix(base, rgb(0x1c1b19), sat(crack * 0.85 + pits * 0.7))
    col = mix(col, rgb(0x191817), sat(wheel * 0.6))
    col = mix(col, rgb(0xb0aea4), scuff * 0.15)
    col = mix(col, mix(rgb(0x4d4f52), rgb(0x6d5a48), step(n2, -0.4, 1.4)), iron)
    col = mix(col, rgb(0x0b0b0a), gap)
    hgt = 0.00018 * n3 + 0.0012 * blur(trowel, 1.5) - 0.005 * crack - 0.004 * blur(pits, 0.8) - 0.0008 * scuff
    rough = 0.88 - 0.3 * oil - 0.08 * step(trowel, 0, 2)
    rough = mix(rough, 0.5, iron)
    write("shed", p, col, hgt * (1 - iron), rough, iron * 0.9)


for name, fn in (("deck", deck), ("mill", mill), ("port", port), ("shed", shed)):
    if not ONLY or name in ONLY:
        _emit.clear()
        PARTS.clear()
        fn()

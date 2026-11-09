#!/usr/bin/env python3
"""Build the 0.1.34 odd bodies (models/bot-odd.glb) in Blender from code. Original work for Scrapline (Longlight Interactive).

  python3 -m venv /tmp/bvenv && /tmp/bvenv/bin/pip install bpy           # Blender as a Python module (bpy 5.x, Python 3.13)
  /tmp/bvenv/bin/python tools/blender-bot-odd.py /tmp/odk/odd.gltf       # writes a .gltf + .bin
  python3 tools/pack-model.py /tmp/odk/odd.gltf models/bot-odd.glb       # quantize and pack, as for every model

On Full and Ultra, vis/bot.js buildWeapon and botLegs swap these in for the coded shapes of the shell spinner, the ring
spinner, the meltybrain's tooth and the shuffler legs (Lite keeps the code). Each piece is one top-level object in three.js
axes (y up, the bot's front at -z); the game scales it to the size it wants, so the sim's sizes still rule, and puts its own
materials on (the colours here are only for Blender). Unlike the attachments, the round ones sit on their own base:
  odd_shell   the shell spinner's dome: radius 1 round the y axis, from the floor (y 0) to the crown (y 1): a short wall to
              y 0.72, a cone to a flat crown at radius 0.6, a rib round the crown, six bolts on it, and two teeth on the rim
              (at +x and -x) from y 0.05 to 0.5
  odd_ring    the ring spinner's ring: a tube 0.08 thick round the y axis at radius 1 (y 0 its middle), with three teeth
  odd_tooth   the meltybrain's tooth, in a unit box (-0.5..0.5) centred on its middle: a hooked block whose point faces +x
  odd_leg     a shuffler leg on its own foot (y 0 the floor): x is scaled by the leg's width, y and z by its height. A
              rubber foot (x -0.8..0.8, z -0.42..0.42), a strut to y 0.9 and a cam round the x axis at y 0.82
Nothing random. Lite never loads the file; until it lands (or if it fails) the coded shapes stand in.
"""
import math, sys
import bpy, bmesh

OUT = sys.argv[-1] if sys.argv[-1].endswith(".gltf") else "/tmp/bot-odd.gltf"

bpy.ops.wm.read_factory_settings(use_empty=True)
SC = bpy.context.scene


def lin(h):
    def c(v):
        v /= 255.0
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (c((h >> 16) & 255), c((h >> 8) & 255), c(h & 255), 1.0)


def mat(name, hexc, metal=1.0, rough=0.4):
    m = bpy.data.materials.new(name)
    if hasattr(m, "use_nodes") and not m.node_tree:
        m.use_nodes = True
    p = m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = lin(hexc)
    p.inputs["Metallic"].default_value = metal
    p.inputs["Roughness"].default_value = rough
    return m


STEEL = mat("od-steel", 0xb8bcc2, 1.0, 0.35)
ALU = mat("od-alu", 0xc9ccd0, 1.0, 0.45)


def B(x, y, z):
    return (x, -z, y)


def mesh_obj(name, verts, faces, m):
    """an object from three.js-space vertices and faces"""
    me = bpy.data.meshes.new(name)
    me.from_pydata([B(*v) for v in verts], [], faces)
    me.validate()
    me.update()
    o = bpy.data.objects.new(name, me)
    SC.collection.objects.link(o)
    o.data.materials.append(m)
    fix(o)
    return o


def fix(o):
    """outward normals, flat shading"""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    for p in o.data.polygons:
        p.use_smooth = False


def smooth(o, deg=35):
    for p in o.data.polygons:
        p.use_smooth = True
    sel(o)
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(deg))
    except Exception:
        o.data.use_auto_smooth = True
        o.data.auto_smooth_angle = math.radians(deg)
    return o


def sel(*objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def apply(o):
    sel(o)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return o


def join(name, parts, m):
    for p in parts:
        apply(p)
        p.data.materials.clear()
        p.data.materials.append(m)
    sel(*parts)
    bpy.ops.object.join()
    o = bpy.context.object
    o.name = name
    o.data.name = name
    return o


def prism(name, prof, a0, a1, m, axis):
    """a 2D profile extruded along an axis: axis "x" takes (z, y) points, "y" takes (x, z), "z" takes (x, y)"""
    n = len(prof)

    def P(p, a):
        if axis == "x":
            return (a, p[1], p[0])
        if axis == "y":
            return (p[0], a, p[1])
        return (p[0], p[1], a)
    v = [P(p, a0) for p in prof] + [P(p, a1) for p in prof]
    f = [list(range(n))[::-1], list(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        f.append([i, j, n + j, n + i])
    return mesh_obj(name, v, f, m)


def barrel(prof, n, frame, m, name):
    """a solid turned round its own axis: prof [(r, a), ...] closed at both ends, placed by frame(u, p, q) -> three point"""
    v, f, rings = [], [], []
    for r, a in prof:
        if r < 1e-9:
            rings.append([len(v)])
            v.append(frame(a, 0.0, 0.0))
            continue
        ring = []
        for k in range(n):
            t = 2 * math.pi * k / n
            ring.append(len(v))
            v.append(frame(a, math.cos(t) * r, math.sin(t) * r))
        rings.append(ring)
    for ra, rb in zip(rings, rings[1:]):
        if len(ra) == 1:
            for k in range(n):
                f.append([ra[0], rb[(k + 1) % n], rb[k]])
        elif len(rb) == 1:
            for k in range(n):
                f.append([ra[k], ra[(k + 1) % n], rb[0]])
        else:
            for k in range(n):
                k1 = (k + 1) % n
                f.append([ra[k], ra[k1], rb[k1], rb[k]])
    return mesh_obj(name, v, f, m)


def box(x0, x1, y0, y1, z0, z1, m, name="b"):
    v = [(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
    f = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]
    return mesh_obj(name, v, f, m)


def bolt(x, y, z, r=0.04, h=0.03, axis="y"):
    """a hex bolt head standing on a face, along axis y (up) or z"""
    if axis == "y":
        fr = lambda u, p, q: (x + p, y + u, z + q)
    else:
        fr = lambda u, p, q: (x + p, y + q, z + u)
    return barrel([(0, 0), (r, 0), (r, h), (0, h)], 6, fr, STEEL, "bolt")


def along_z(z0, z1, cx, cy):
    """a frame for barrel(): its axis along z from z0 (u = 0) towards z1, centred on (cx, cy)"""
    d = 1 if z1 > z0 else -1
    return lambda u, p, q: (cx + p, cy + q, z0 + d * u)



RUB = mat("od-rubber", 0x2a2a2e, 0.0, 0.9)


def turned(prof, n, m, name, y0=0.0):
    """a solid turned round the y axis: prof [(r, y), ...]"""
    return barrel(prof, n, lambda u, p, q: (p, y0 + u, q), m, name)


def ring_tube(R, t, n, k, m, name):
    """a torus round the y axis: R the ring's radius, t the tube's, n segments round the ring, k round the tube"""
    v, f = [], []
    for i in range(n):
        a = 2 * math.pi * i / n
        for j in range(k):
            b = 2 * math.pi * j / k
            r = R + t * math.cos(b)
            v.append((math.cos(a) * r, t * math.sin(b), math.sin(a) * r))
    for i in range(n):
        for j in range(k):
            i1, j1 = (i + 1) % n, (j + 1) % k
            f.append([i * k + j, i1 * k + j, i1 * k + j1, i * k + j1])
    return mesh_obj(name, v, f, m)


def tooth(a, r, y0, y1, w, d, m):
    """a tooth on a rim at angle a (round y from +x), standing out from radius r by d, w wide, y0..y1 high"""
    c, s = math.cos(a), math.sin(a)
    pts = [(r - 0.02, -w / 2), (r + d, -w / 2 + 0.02), (r + d * 0.9, w / 2), (r - 0.02, w / 2)]
    v = []
    for y in (y0, y1):
        for (u, t) in pts:
            v.append((u * c - t * s, y, u * s + t * c))
    f = [[0, 1, 2, 3][::-1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
    return mesh_obj("t", v, f, m)


# ---- the shell spinner's dome ----
sh = [turned([(0, 0), (1, 0), (1, 0.72), (0.6, 1), (0, 1)], 48, STEEL, "dome")]
sh.append(turned([(0.58, 0.985), (0.66, 0.985), (0.66, 1.02), (0.58, 1.02)], 48, STEEL, "rib"))
for i in range(6):
    a = 2 * math.pi * i / 6
    sh.append(bolt(math.cos(a) * 0.4, 1.0, math.sin(a) * 0.4, 0.035, 0.025))
for a in (0, math.pi):
    sh.append(tooth(a, 1.0, 0.05, 0.5, 0.22, 0.12, STEEL))
smooth(join("odd_shell", sh, STEEL), 30)

# ---- the ring spinner's ring ----
rg = [ring_tube(1.0, 0.08, 64, 10, STEEL, "ring")]
for i in range(3):
    rg.append(tooth(2 * math.pi * i / 3, 1.0, -0.09, 0.09, 0.18, 0.13, STEEL))
smooth(join("odd_ring", rg, STEEL), 40)

# ---- the meltybrain's tooth ----
tt = [mesh_obj("t", [(-0.5, -0.5, -0.5), (0.3, -0.5, -0.5), (0.5, -0.5, 0.2), (0.3, -0.5, 0.5), (-0.5, -0.5, 0.5),
                     (-0.5, 0.5, -0.5), (0.3, 0.5, -0.5), (0.5, 0.5, 0.2), (0.3, 0.5, 0.5), (-0.5, 0.5, 0.5)],
               [[4, 3, 2, 1, 0], [5, 6, 7, 8, 9], [0, 1, 6, 5], [1, 2, 7, 6], [2, 3, 8, 7], [3, 4, 9, 8], [4, 0, 5, 9]], STEEL)]
for z in (-0.25, 0.2):
    tt.append(bolt(-0.25, 0.5, z, 0.08, 0.05))
join("odd_tooth", tt, STEEL)

# ---- a shuffler leg ----
lg = [box(-0.8, 0.8, 0.0, 0.08, -0.42, 0.42, RUB, "foot")]
for x in (-0.6, 0.6):
    for z in (-0.3, 0.3):
        lg.append(box(x - 0.12, x + 0.12, -0.012, 0.0, z - 0.06, z + 0.06, RUB, "tread"))
lg.append(box(-0.3, 0.3, 0.08, 0.14, -0.2, 0.2, ALU, "ankle"))
lg.append(box(-0.25, 0.25, 0.1, 0.9, -0.06, 0.06, ALU, "strut"))
lg.append(barrel([(0, -0.45), (0.2, -0.45), (0.2, 0.45), (0, 0.45)], 20, lambda u, p, q: (u, 0.82 + p, 0.06 + q), STEEL, "cam"))
lg.append(barrel([(0, -0.55), (0.05, -0.55), (0.05, 0.55), (0, 0.55)], 10, lambda u, p, q: (u, 0.82 + p, q), STEEL, "axle"))
lg = [join("odd_leg", lg, ALU)]

bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLTF_SEPARATE", export_apply=True, export_yup=True,
                          export_normals=True, export_materials="EXPORT", use_selection=False)
print("wrote", OUT)

#!/usr/bin/env python3
"""Build the arena kit (models/arena-kit.glb) in Blender from code. Original work for Scrapline (Longlight Interactive).

  python3 -m venv /tmp/bvenv && /tmp/bvenv/bin/pip install bpy        # Blender as a Python module (bpy 5.x, Python 3.13)
  /tmp/bvenv/bin/python tools/blender-arena-kit.py /tmp/kit.gltf      # writes a .gltf + .bin
  python3 tools/pack-model.py /tmp/kit.gltf models/arena-kit.glb      # quantize and pack, as for every model

Every piece is one top-level node the game picks by name (vis/props.js, arenaKit). Sizes are in arena scene units (the
arena view runs at 4 units a beetle metre): the kerb is 0.35 high and 0.15 thick, the screen 1.1 high on top, as the coded
walls in vis/arena.js, so a piece swaps in where the coded box was. Coordinates below are three.js's (y up, +z towards the
camera); B() turns them into Blender's (z up). Colours are sRGB hex like the game's, turned linear for glTF.
  kerb      one metre-ish of wall (x -0.5..0.5): kerb, sloped steel face on the arena side (+z), bolts, a steel cap
  frame     the screen's upright at x -0.5 and a bottom rail, to tile along the far and side walls
  post      a corner post with a base plate and gussets, and a beacon on top (post_lamp, tinted by the game)
  pusher    a wall ram 1 deep (x, face at +x), 1 high and 3 long (z): yellow with black stripes on top and face, a light
            bar along the back of the top (pusher_glow)
  spinner   a floor turntable, unit radius: bolted disc, a toothed bar, a light ring (spinner_glow)
  flame     a floor grate one unit square (0.1.37): a frame, nine bars, burner nozzles, a glow under the bars (flame_glow)
  pitedge   one unit of striped pit edge along x (0.1 wide), to tile round a pit
  pitwell   a unit open-topped well under the pit hole (x, z -0.5..0.5, y 0..-1)
  stands    in metres, not arena units: a 4 m bleacher block, four 0.45 m tiers rising away from the arena (front at z 0,
            back at z -3.2), seated people on them; the game scales it (vis/props.js, kitBuild)
Nothing random at run time: the crowd is laid out here once from a fixed seed.
"""
import math, random, sys
import bpy

OUT = sys.argv[-1] if sys.argv[-1].endswith(".gltf") else "/tmp/arena-kit.gltf"

bpy.ops.wm.read_factory_settings(use_empty=True)
SC = bpy.context.scene


def lin(h):
    def c(v):
        v /= 255.0
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (c((h >> 16) & 255), c((h >> 8) & 255), c(h & 255), 1.0)


MATS = {}


def mat(name, hexc, metal=0.0, rough=0.7):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    if hasattr(m, "use_nodes") and not m.node_tree:
        m.use_nodes = True
    p = m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = lin(hexc)
    p.inputs["Metallic"].default_value = metal
    p.inputs["Roughness"].default_value = rough
    MATS[name] = m
    return m


STEEL = mat("kit-steel", 0x9a9fa6, 1.0, 0.42)
DARK = mat("kit-dark", 0x34332f, 0.5, 0.6)
WALL = mat("kit-wall", 0x4a4740, 0.0, 0.8)
YEL = mat("kit-yellow", 0xd9a52f, 0.0, 0.55)
BLK = mat("kit-black", 0x1c1b19, 0.0, 0.7)
LAMP = mat("kit-lamp", 0x6b5b3c, 0.0, 0.4)
HOLE = mat("kit-hole", 0x0a0a0a, 0.0, 1.0)
SEAT = mat("kit-seat", 0x2c2f33, 0.3, 0.6)
SHIRTS = [mat("kit-shirt%d" % i, h, 0.0, 0.9) for i, h in enumerate([0x7a3b33, 0x2f4a6b, 0x56614a, 0x8a7a5a, 0x3a3a40, 0x6a4f7a, 0x9a9690])]
SKINS = [mat("kit-skin%d" % i, h, 0.0, 0.8) for i, h in enumerate([0xc99a7a, 0x8a5f45, 0xe0bfa0])]


def B(x, y, z):
    return (x, -z, y)


def empty(name):
    o = bpy.data.objects.new(name, None)
    SC.collection.objects.link(o)
    return o


def link(o, parent, m):
    o.data.materials.append(m)
    o.parent = parent
    return o


def box(parent, name, sx, sy, sz, x, y, z, m, bevel=0.0, rz=0.0):
    """a box sx (x) by sy (y, up) by sz (z) centred at (x, y, z) in three.js space; rz turns it about three's z"""
    bpy.ops.mesh.primitive_cube_add(size=1, location=B(x, y, z))
    o = bpy.context.object
    o.name = name
    o.scale = (sx, sz, sy)
    o.rotation_euler = (0, -rz, 0) if rz else (0, 0, 0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if bevel:
        b = o.modifiers.new("b", "BEVEL")
        b.width = bevel
        b.segments = 1
        b.limit_method = "ANGLE"
    return link(o, parent, m)


def cyl(parent, name, r, h, x, y, z, m, n=16, axis="y", r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=n, radius=r, depth=h, location=B(x, y, z))
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=n, radius1=r, radius2=r2, depth=h, location=B(x, y, z))
    o = bpy.context.object
    o.name = name
    if axis == "x":
        o.rotation_euler = (0, math.pi / 2, 0)
    elif axis == "z":
        o.rotation_euler = (math.pi / 2, 0, 0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    return link(o, parent, m)


def ball(parent, name, r, x, y, z, m):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=r, location=B(x, y, z))
    o = bpy.context.object
    o.name = name
    return link(o, parent, m)


def join(parent, name, parts):
    """merge parts sharing materials into one mesh, so a piece is a few draw calls"""
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        for md in p.modifiers:
            bpy.context.view_layer.objects.active = p
            bpy.ops.object.modifier_apply(modifier=md.name)
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    o = bpy.context.object
    o.name = name
    o.parent = parent
    return o


# ---- kerb: 0.35 high, 0.15 thick, one unit long ----
g = empty("kerb")
p = [box(g, "k", 1.0, 0.33, 0.13, 0, 0.165, -0.01, WALL, 0.01),
     box(g, "k", 1.0, 0.03, 0.16, 0, 0.35 - 0.015, 0, STEEL, 0.006),              # the cap
     box(g, "k", 1.0, 0.012, 0.22, 0, 0.006, -0.03, DARK)]                         # a foot
face = box(g, "k", 1.0, 0.2, 0.02, 0, 0.12, 0.066, STEEL, 0.004)                   # the face plate on the arena side, leaning back
face.rotation_euler = (math.radians(-12), 0, 0)
p.append(face)
for bx in (-0.36, 0, 0.36):
    p.append(cyl(g, "k", 0.016, 0.02, bx, 0.17, 0.085, STEEL, 6, "z"))
    p.append(cyl(g, "k", 0.016, 0.02, bx, 0.07, 0.086, STEEL, 6, "z"))
join(g, "kerb_body", p)

# ---- frame: an upright for the screen at x -0.5, and a bottom rail ----
g = empty("frame")
p = [box(g, "f", 0.05, 1.1, 0.05, -0.5, 0.35 + 0.55, 0, STEEL, 0.006),
     box(g, "f", 1.0, 0.04, 0.05, 0, 0.37, 0, DARK),
     box(g, "f", 0.08, 0.06, 0.07, -0.5, 1.42, 0, DARK, 0.006)]
join(g, "frame_body", p)

# ---- post: 0.2 square, 1.65 tall, a beacon on top ----
g = empty("post")
p = [box(g, "p", 0.2, 1.62, 0.2, 0, 0.81, 0, DARK, 0.012),
     box(g, "p", 0.34, 0.025, 0.34, 0, 0.0125, 0, STEEL, 0.005),
     box(g, "p", 0.24, 0.04, 0.24, 0, 1.62, 0, STEEL, 0.006)]
for a in range(4):
    gx, gz = [(0.13, 0), (-0.13, 0), (0, 0.13), (0, -0.13)][a]
    w, d = (0.06, 0.012) if gz == 0 else (0.012, 0.06)   # a fin standing out from each face
    p.append(box(g, "p", w, 0.12, d, gx, 0.08, gz, STEEL))
for bx, bz in ((0.13, 0.13), (-0.13, 0.13), (0.13, -0.13), (-0.13, -0.13)):
    p.append(cyl(g, "p", 0.014, 0.03, bx, 0.03, bz, STEEL, 6))
p.append(cyl(g, "p", 0.075, 0.03, 0, 1.655, 0, DARK, 16))
for a in range(4):   # a cage round the beacon
    ang = a * math.pi / 2 + math.pi / 4
    p.append(box(g, "p", 0.012, 0.16, 0.012, 0.07 * math.cos(ang), 1.74, 0.07 * math.sin(ang), STEEL))
p.append(cyl(g, "p", 0.08, 0.012, 0, 1.825, 0, STEEL, 16))
join(g, "post_body", p)
cyl(g, "post_lamp", 0.055, 0.14, 0, 1.74, 0, LAMP, 16)

# ---- pusher: depth 1 (x, face at +x), height 1, length 3 (z): about the shape of every arena's rams ----
def clip(poly, x0, x1, y0, y1):
    """a 2D polygon clipped to a rectangle (Sutherland-Hodgman)"""
    for k, lim, keep_hi in ((0, x0, True), (0, x1, False), (1, y0, True), (1, y1, False)):
        out = []
        for i in range(len(poly)):
            a, b = poly[i - 1], poly[i]
            ina, inb = (a[k] >= lim) == keep_hi, (b[k] >= lim) == keep_hi
            if ina != inb:
                t = (lim - a[k]) / (b[k] - a[k])
                out.append((a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])))
            if inb:
                out.append(b)
        poly = out
        if not poly:
            return []
    return poly


def stripes(parent, name, u0, u1, v0, v1, place, m, width=0.22):
    """diagonal black stripes on a panel spanning u0..u1, v0..v1; place(u, v) gives the 3D point (three.js space)"""
    verts, faces = [], []
    c = u0 - (v1 - v0) - width
    while c < u1 + width:
        q = clip([(c, v0), (c + width, v0), (c + width + (v1 - v0), v1), (c + (v1 - v0), v1)], u0, u1, v0, v1)
        if len(q) >= 3:
            faces.append(list(range(len(verts), len(verts) + len(q))))
            verts += [B(*place(u, v)) for u, v in q]
        c += 2 * width
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    SC.collection.objects.link(o)
    o.data.materials.append(m)
    o.parent = parent
    return o


g = empty("pusher")
p = [box(g, "u", 1.0, 1.0, 3.0, 0, 0.5, 0, YEL, 0.02),                       # the yellow ram; black stripes on top and face
     box(g, "u", 1.1, 0.06, 3.1, -0.05, 0.03, 0, DARK)]
p += [cyl(g, "u", 0.07, 0.6, -0.6, 0.5, z, STEEL, 10, "x") for z in (-0.9, 0.9)]   # rods behind it, in the wall
join(g, "pusher_body", p)
top = stripes(g, "pusher_top", -0.5, 0.5, -1.5, 1.5, lambda u, v: (u, 1.025, v), BLK)
face = stripes(g, "pusher_face", -1.5, 1.5, 0.05, 0.95, lambda u, v: (0.515, v, -u), BLK)
for o in (top, face):   # make sure the faces point out (up / +x)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
want = {"pusher_top": (0, 0, 1), "pusher_face": (1, 0, 0)}
for o in (top, face):
    w = want[o.name]
    if sum(a * b for a, b in zip(o.data.polygons[0].normal, w)) < 0:
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.flip_normals()
        bpy.ops.object.mode_set(mode="OBJECT")
box(g, "pusher_glow", 0.14, 0.04, 2.6, -0.38, 1.02, 0, LAMP, 0.01)       # a light bar along the back of the top

# ---- spinner: unit radius, about 0.05 tall ----
g = empty("spinner")
p = [cyl(g, "s", 0.92, 0.03, 0, 0.0, 0, STEEL, 40),
     cyl(g, "s", 0.25, 0.03, 0, 0.03, 0, DARK, 24)]
for a in range(10):
    ang = a * math.tau / 10
    p.append(cyl(g, "s", 0.035, 0.03, 0.72 * math.cos(ang), 0.012, 0.72 * math.sin(ang), DARK, 6))
p.append(box(g, "s", 1.7, 0.045, 0.2, 0, 0.04, 0, DARK, 0.01))
for sx in (-1, 1):   # teeth at the bar ends
    t = box(g, "s", 0.12, 0.06, 0.22, sx * 0.82, 0.05, 0, STEEL, 0.008)
    p.append(t)
join(g, "spinner_body", p)
bpy.ops.mesh.primitive_torus_add(major_radius=0.96, minor_radius=0.035, major_segments=40, minor_segments=6, location=B(0, 0.005, 0))
ring = bpy.context.object
ring.name = "spinner_glow"
link(ring, g, LAMP)

# ---- flame: a floor grate one unit square (x by z), flush with the floor; the vis scales it to the hazard's rect ----
g = empty("flame")
p = [box(g, "f", 1.0, 0.02, 1.0, 0, -0.012, 0, HOLE)]                       # the dark tray under the bars
for sx in (-1, 1):                                                          # the frame
    p.append(box(g, "f", 0.06, 0.03, 1.0, sx * 0.47, 0.012, 0, STEEL, 0.006))
    p.append(box(g, "f", 0.88, 0.03, 0.06, 0, 0.012, sx * 0.47, STEEL, 0.006))
for i in range(9):                                                          # the bars, along z
    p.append(box(g, "f", 0.035, 0.022, 0.88, -0.36 + i * 0.09, 0.012, 0, DARK, 0.004))
for i in range(4):                                                          # burner nozzles under the bars
    p.append(cyl(g, "f", 0.05, 0.02, -0.3 + i * 0.2, 0.0, 0, STEEL, 10))
join(g, "flame_body", p)
box(g, "flame_glow", 0.86, 0.006, 0.86, 0, -0.002, 0, LAMP)                 # the pilot's glow under the bars

# ---- pit edge: one unit along x, 0.1 wide, hazard stripes ----
g = empty("pitedge")
p = [box(g, "e", 1.0, 0.02, 0.1, 0, 0.01, 0, BLK)]
for i in range(5):
    s = box(g, "e", 0.09, 0.022, 0.1, -0.4 + i * 0.2, 0.011, 0, YEL)
    s.rotation_euler = (0, 0, math.radians(35))
    p.append(s)
join(g, "pitedge_body", p)

# ---- pit well: an open box under the hole ----
g = empty("pitwell")
bpy.ops.mesh.primitive_cube_add(size=1, location=B(0, -0.5, 0))
w = bpy.context.object
w.name = "pitwell_body"
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="DESELECT")
bpy.ops.object.mode_set(mode="OBJECT")
for f in w.data.polygons:   # drop the top face, flip the rest to face inwards
    f.select = f.normal.z > 0.5
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.delete(type="FACE")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.flip_normals()
bpy.ops.object.mode_set(mode="OBJECT")
link(w, g, HOLE)

# ---- stands: in metres (the game scales them to its dressing scale), four tiers, seated people on them ----
# Real sizes so the people agree with the props (vis/props.js ARENA_PROP_UNITS): a 0.45 m step, rows 0.8 m deep, people
# 0.55 m apart with a 0.6 m torso, a 0.23 m head, thighs on the step and shins down its face. 0.1.21.1: the old block
# was in arena units with half-size people, so they came out doll-sized next to a barrel.
g = empty("stands")
rnd = random.Random(1979)
p = []
ROW, RISE, N = 0.8, 0.45, 4
tiers = [(k * ROW, RISE * (k + 1)) for k in range(N)]   # (z back from the front, tread height)
for k, (zb, th) in enumerate(tiers):
    p.append(box(g, "t", 4.0, th, ROW, 0, th / 2, -zb - ROW / 2, SEAT, 0.01))
p.append(box(g, "t", 4.0, 0.05, 0.05, 0, 1.0, 0.25, STEEL))      # a front rail at hand height
for x in (-1.9, 0, 1.9):
    p.append(box(g, "t", 0.05, 1.0, 0.05, x, 0.5, 0.25, STEEL))
top = tiers[-1][1]
p.append(box(g, "t", 4.0, 0.05, 0.05, 0, top + 1.0, -N * ROW + 0.05, STEEL))   # a rail along the back of the top row
p.append(box(g, "t", 4.0, top + 0.3, 0.1, 0, (top + 0.3) / 2, -N * ROW - 0.05, SEAT))   # the back wall
join(g, "stands_body", p)
people = {}
for k, (zb, th) in enumerate(tiers):
    for i in range(7):
        if rnd.random() < 0.2:
            continue
        x = -1.65 + i * 0.55 + rnd.uniform(-0.06, 0.06)
        zf = -zb                                    # the front edge of this step
        z = zf - 0.42 + rnd.uniform(-0.04, 0.04)    # the torso, back from the edge
        shirt = rnd.choice(SHIRTS)
        skin = rnd.choice(SKINS)
        legs = rnd.choice([BLK, SEAT, SHIRTS[1], SHIRTS[4]])
        tall = rnd.uniform(0.92, 1.08)
        tt = 0.6 * tall
        lean = rnd.uniform(-0.06, 0.06)
        t = box(g, "b", 0.42, tt, 0.24, x, th + tt / 2, z, shirt, 0.03, lean)
        h = ball(g, "h", 0.115, x + lean * tt * 0.5, th + tt + 0.13, z + 0.02, skin)
        th_ = box(g, "l", 0.36, 0.14, 0.46, x, th + 0.07, zf - 0.2, legs)          # thighs along the step
        sh_ = box(g, "l", 0.32, 0.44, 0.12, x, th - 0.22, zf + 0.04, legs)         # shins down the step's face
        people.setdefault(shirt.name, []).append(t)
        people.setdefault(skin.name, []).append(h)
        people.setdefault(legs.name, []).extend([th_, sh_])
for i, (mn, parts) in enumerate(sorted(people.items())):
    join(g, "stands_crowd%d" % i, parts)

bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLTF_SEPARATE", export_apply=True, export_yup=True,
                          export_normals=True, export_materials="EXPORT", use_selection=False)
print("wrote", OUT)

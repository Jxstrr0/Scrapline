#!/usr/bin/env python3
"""Build the bots' detail parts (models/bot-detail.glb) in Blender from code. Original work for Scrapline (Longlight Interactive).

  python3 -m venv /tmp/bvenv && /tmp/bvenv/bin/pip install bpy           # Blender as a Python module (bpy 5.x, Python 3.13)
  /tmp/bvenv/bin/python tools/blender-bot-detail.py /tmp/dtk/dt.gltf     # writes a .gltf + .bin
  python3 tools/pack-model.py /tmp/dtk/dt.gltf models/bot-detail.glb     # quantize and pack, as for every model

On Full and Ultra, vis/bot.js dresses every bot with these (0.1.41; Lite keeps the coded cylinders and boxes). Each piece is
one top-level object the game picks by name and stretches, so each is modelled in its own unit, given below as three.js
axes (y up, the bot's front at -z). The game puts its own materials on, so the colours here are only for Blender.
 Wheels, the axle along x, x -0.5..0.5 the tyre's width, y and z the radius (1 at the tread):
  dt_tyre_block   a rubber tyre: a rounded carcass with two rows of staggered lugs
  dt_tyre_foam    a foam tyre: smooth, with round shoulders
  dt_tyre_pu      a polyurethane tyre: square shoulders and three grooves round it
  dt_tyre_solid   the band of a solid wheel: thin, with a knurled tread
  dt_hub_spoke    a five-spoke hub for the first three (their bore is at radius 0.6): rim lips, a recessed web, spokes, a
                  boss and a nut, the same on both faces
  dt_hub_disc     the solid wheel's disc (out to radius 0.88): dished, with six lightening holes and a bolt circle
 Tracks:
  dt_trk_link     one track link: x -0.5..0.5 the belt's width, z -0.5..0.5 one pitch along the belt, y 0 the belt's inner
                  face and 1 the top of its grouser bar; a guide tooth hangs inside (y < 0) on the centre line
  dt_trk_wheel    a sprocket / road wheel, the axle along x, radius 1 where the belt's inner face rides: two holed discs
                  with a gap between them for the guide teeth, a hub and a nut
 Fittings, standing on y 0, radius 1 (or a unit box where noted):
  dt_bolt         a button-head screw with a socket (height 0.6)
  dt_hex          a hex head on a washer (height 0.7)
  dt_lamp_base    the power light's bezel;  dt_lamp_lens  its lens (the game lights it in the team's colour)
  dt_link_base    the removable link's socket (x -0.5..0.5, z -0.32..0.32, y 0..0.45);  dt_link_key  its plug and pull loop
Nothing random. Lite never loads the file; until it lands (or if it fails) the coded shapes stand in.
"""
import math, sys
import bpy, bmesh

OUT = sys.argv[-1] if sys.argv[-1].endswith(".gltf") else "/tmp/bot-detail.gltf"

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


RUB = mat("dt-rubber", 0x2a2a2c, 0.0, 0.85)
STEEL = mat("dt-steel", 0xb8bcc2, 1.0, 0.35)
ALU = mat("dt-alu", 0xc9ccd0, 1.0, 0.45)


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
    """smooth shading with hard edges past deg (the round faces read round, the chamfers stay crisp)"""
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
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    return o


def remove(o):
    bpy.data.objects.remove(o, do_unlink=True)


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


def lathe(name, prof, n, m, axis="y"):
    """a profile [(r, a), ...] from the axis back to the axis, turned round axis y (or x): a closed solid of n sides"""
    v, f = [], []
    rings = []
    for r, a in prof:
        if r < 1e-9:
            rings.append([len(v)])
            v.append((0, a, 0) if axis == "y" else (a, 0, 0))
            continue
        ring = []
        for k in range(n):
            t = 2 * math.pi * k / n
            c, s = math.cos(t) * r, math.sin(t) * r
            ring.append(len(v))
            v.append((c, a, s) if axis == "y" else (a, c, s))
        rings.append(ring)
    for ra, rb in zip(rings, rings[1:]):
        if len(ra) == 1 and len(rb) == 1:
            continue
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


def cyl(r, depth, loc, axis="y", n=24, sx=1.0, sz=1.0):
    """a cylinder at loc (three.js), along axis; sx / sz squash it across (for pre-squashed round holes and bosses): along y
    they scale three x and z, along x three y and z"""
    bpy.ops.mesh.primitive_cylinder_add(vertices=n, radius=r, depth=depth, location=B(*loc))
    o = bpy.context.object
    if axis == "y":                         # Blender z
        o.scale = (sx, sz, 1)
    elif axis == "x":
        o.rotation_euler = (0, math.pi / 2, 0)
        o.scale = (sx, sz, 1)                # after the turn local x lies along three y and local y along three z
    else:                                    # three z = Blender -y
        o.rotation_euler = (math.pi / 2, 0, 0)
        o.scale = (sx, sz, 1)
    apply(o)
    return o


def cut(o, cutters):
    """o minus each cutter (removed afterwards)"""
    for c in cutters:
        md = o.modifiers.new("cut", "BOOLEAN")
        md.operation, md.solver, md.object = "DIFFERENCE", "EXACT", c
        sel(o)
        bpy.ops.object.modifier_apply(modifier=md.name)
        remove(c)
    return o



def barrel(prof, n, frame, m, name):
    """a solid turned round its own axis: prof [(r, a), ...] closed at both ends, then placed by frame(u, p, q) -> three
    point, u along the axis and p, q across it"""
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




def ring_lathe(name, prof, n, m, rmod=None):
    """a closed profile loop [(r, a), ...] that never touches the axis, turned round x: a ring of n sides. rmod(k, i, r)
    can change the radius of profile point i on side k (a knurl)"""
    v, f = [], []
    np_ = len(prof)
    for i, (r, a) in enumerate(prof):
        for k in range(n):
            t = 2 * math.pi * k / n
            rr = rmod(k, i, r) if rmod else r
            v.append((a, math.cos(t) * rr, math.sin(t) * rr))
    for i in range(np_):
        j = (i + 1) % np_
        for k in range(n):
            k1 = (k + 1) % n
            f.append([i * n + k, i * n + k1, j * n + k1, j * n + k])
    return mesh_obj(name, v, f, m)


def hexa(pts, m, name="h"):
    """a six-faced solid from 8 points: the bottom four round, then the top four the same way round"""
    return mesh_obj(name, pts, [[3, 2, 1, 0], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]], m)


def polar(t, r, x):
    return (x, math.cos(t) * r, math.sin(t) * r)


# ---- tyres ----
# rubber: a rounded carcass and two rows of lugs, the rows half a pitch apart, each lug running down its shoulder
car = ring_lathe("c", [(0.60, -0.46), (0.66, -0.5), (0.80, -0.5), (0.87, -0.45), (0.9, -0.36), (0.9, 0.36), (0.87, 0.45),
                       (0.80, 0.5), (0.66, 0.5), (0.60, 0.46)], 40, RUB)
smooth(car, 40)
NL = 18
lugs = []
for k in range(NL):
    for row in (-1, 1):
        t = 2 * math.pi * (k + (0.5 if row > 0 else 0.0)) / NL
        w0, w1 = 0.092, 0.07                                    # half the lug's length round the wheel, bottom and top
        xi, xo = row * 0.03, row * 0.5                           # from the centre line out to the shoulder
        sk = 0.05 * row                                          # the lug leans back toward the shoulder
        lugs.append(hexa([polar(t - w0, 0.89, xi), polar(t + w0, 0.89, xi), polar(t + w0 + sk, 0.82, xo), polar(t - w0 + sk, 0.82, xo),
                          polar(t - w1, 1.0, xi), polar(t + w1, 1.0, xi), polar(t + w1 + sk, 0.93, xo * 0.94), polar(t - w1 + sk, 0.93, xo * 0.94)], RUB))
join("dt_tyre_block", [car] + lugs, RUB)

smooth(ring_lathe("dt_tyre_foam", [(0.60, -0.48), (0.88, -0.5), (0.95, -0.46), (0.99, -0.36), (1.0, -0.2), (1.0, 0.2), (0.99, 0.36),
                                   (0.95, 0.46), (0.88, 0.5), (0.60, 0.48)], 48, RUB), 50)

pu = [(0.60, -0.5), (0.94, -0.5), (1.0, -0.44)]
for gx in (-0.24, 0.0, 0.24):                                    # three grooves
    pu += [(1.0, gx - 0.05), (0.93, gx - 0.035), (0.93, gx + 0.035), (1.0, gx + 0.05)]
pu += [(1.0, 0.44), (0.94, 0.5), (0.60, 0.5)]
smooth(ring_lathe("dt_tyre_pu", pu, 48, RUB), 30)

ring_lathe("dt_tyre_solid", [(0.86, -0.5), (0.97, -0.5), (1.0, -0.44), (1.0, 0.44), (0.97, 0.5), (0.86, 0.5)], 72, RUB,
           rmod=lambda k, i, r: r - (0.035 if (i in (2, 3) and k % 2) else 0.0))

# ---- the five-spoke hub ----
hb = [smooth(ring_lathe("rim", [(0.50, -0.5), (0.68, -0.52), (0.69, -0.47), (0.62, -0.43), (0.62, 0.43), (0.69, 0.47), (0.68, 0.52),
                                (0.50, 0.5)], 32, ALU), 40),
      smooth(lathe("web", [(0, 0.2), (0.52, 0.2), (0.52, -0.2), (0, -0.2)], 32, ALU, "x"), 40)]
for sx in (-1, 1):
    hb.append(smooth(lathe("boss", [(0, sx * 0.5), (0.11, sx * 0.5), (0.2, sx * 0.44), (0.22, sx * 0.2), (0, sx * 0.2)][::sx], 16, ALU, "x"), 40))
    hb.append(lathe("nut", [(0, sx * 0.56), (0.085, sx * 0.56), (0.1, sx * 0.54), (0.1, sx * 0.5), (0, sx * 0.5)][::sx], 6, STEEL, "x"))
    for k in range(5):
        t = 2 * math.pi * k / 5
        a0, a1 = 0.36, 0.09                                      # half the spoke's angle at the boss and at the rim
        f0, f1, b = sx * 0.46, sx * 0.4, sx * 0.19
        pts = [polar(t - a0, 0.17, b), polar(t + a0, 0.17, b), polar(t + a1, 0.56, b), polar(t - a1, 0.56, b),
               polar(t - a0 * 0.8, 0.17, f0), polar(t + a0 * 0.8, 0.17, f0), polar(t + a1 * 0.8, 0.56, f1), polar(t - a1 * 0.8, 0.56, f1)]
        hb.append(hexa(pts, ALU))
join("dt_hub_spoke", hb, ALU)

# ---- the solid wheel's disc ----
disc = lathe("d", [(0, -0.46), (0.2, -0.46), (0.24, -0.4), (0.3, -0.32), (0.76, -0.32), (0.8, -0.5), (0.88, -0.5), (0.88, 0.5), (0.8, 0.5),
                   (0.76, 0.32), (0.3, 0.32), (0.24, 0.4), (0.2, 0.46), (0, 0.46)], 36, ALU, "x")
cut(disc, [cyl(0.115, 1.4, polar(2 * math.pi * (k + 0.5) / 6, 0.53, 0), "x", 14) for k in range(6)])
dparts = [disc]
for sx in (-1, 1):
    for k in range(6):
        dparts.append(cyl(0.04, 0.06, polar(2 * math.pi * k / 6, 0.2, sx * 0.47), "x", 6))
smooth(join("dt_hub_disc", dparts, ALU), 35)

# ---- a track link ----
lk = [prism("pad", [(-0.44, 0), (0.44, 0), (0.47, 0.12), (0.47, 0.38), (0.4, 0.5), (-0.4, 0.5), (-0.47, 0.38), (-0.47, 0.12)], -0.5, 0.5, RUB, "x"),
      prism("bar", [(-0.2, 0.5), (0.2, 0.5), (0.09, 1.0), (-0.09, 1.0)], -0.5, 0.5, RUB, "x"),
      prism("tooth", [(-0.2, 0), (-0.07, -0.5), (0.07, -0.5), (0.2, 0)], -0.11, 0.11, RUB, "x")]
for sx in (-0.3, 0.3):
    lk.append(cyl(0.13, 0.26, (sx, 0.25, 0.47), "x", 8))        # the hinge knuckles at the link's back edge
join("dt_trk_link", lk, RUB)

# ---- a sprocket / road wheel for tracks ----
tw = []
for sx in (-1, 1):
    d = lathe("d", [(0, sx * 0.46), (0.94, sx * 0.46), (1.0, sx * 0.42), (1.0, sx * 0.3), (0.94, sx * 0.26), (0, sx * 0.26)][::sx], 24, ALU, "x")
    cut(d, [cyl(0.2, 0.4, polar(2 * math.pi * k / 5, 0.6, sx * 0.36), "x", 12) for k in range(5)])
    tw.append(d)
    tw.append(lathe("nut", [(0, sx * 0.56), (0.13, sx * 0.56), (0.16, sx * 0.53), (0.16, sx * 0.46), (0, sx * 0.46)][::sx], 6, STEEL, "x"))
tw.append(lathe("hub", [(0, 0.3), (0.3, 0.3), (0.3, -0.3), (0, -0.3)], 16, ALU, "x"))
smooth(join("dt_trk_wheel", tw, ALU), 35)

# ---- fittings ----
smooth(lathe("dt_bolt", [(0, 0.34), (0.36, 0.34), (0.42, 0.6), (0.7, 0.56), (0.92, 0.38), (1.0, 0.14), (1.0, 0), (0, 0)], 10, STEEL), 40)
join("dt_hex", [lathe("w", [(0, 0.14), (1.0, 0.14), (1.0, 0), (0, 0)], 16, STEEL),
                lathe("h", [(0, 0.7), (0.6, 0.7), (0.76, 0.58), (0.76, 0.14), (0, 0.14)], 6, STEEL)], STEEL)
smooth(lathe("dt_lamp_base", [(0, 0.28), (0.6, 0.28), (0.66, 0.5), (0.86, 0.5), (1.0, 0.3), (1.0, 0), (0, 0)], 20, STEEL), 40)
smooth(lathe("dt_lamp_lens", [(0, 0.98), (0.24, 0.94), (0.44, 0.82), (0.56, 0.62), (0.6, 0.28), (0, 0.28)], 16, ALU), 60)
lb = [prism("b", [(-0.32, 0), (0.32, 0), (0.32, 0.36), (0.24, 0.45), (-0.24, 0.45), (-0.32, 0.36)], -0.5, 0.5, STEEL, "x")]
for sx in (-0.4, 0.4):
    lb.append(cyl(0.06, 0.05, (sx, 0.47, 0), "y", 6))
join("dt_link_base", lb, STEEL)
key = [box(-0.3, 0.3, 0.45, 0.72, -0.17, 0.17, ALU)]
NA, RT, rt = 10, 0.2, 0.05                                       # the pull loop: half a ring in the x-y plane over the plug
v, f = [], []
for i in range(NA + 1):
    a = math.pi * i / NA
    cx_, cy_ = -math.cos(a) * RT, 0.72 + math.sin(a) * RT * 1.25
    for j in range(6):
        b = 2 * math.pi * j / 6
        rr = math.cos(b) * rt
        v.append((cx_ - math.cos(a) * rr, cy_ + math.sin(a) * rr * 1.25, math.sin(b) * rt))
for i in range(NA):
    for j in range(6):
        j1 = (j + 1) % 6
        f.append([i * 6 + j, i * 6 + j1, (i + 1) * 6 + j1, (i + 1) * 6 + j])
key.append(mesh_obj("loop", v, f, ALU))
join("dt_link_key", key, ALU)

bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLTF_SEPARATE", export_apply=True, export_yup=True,
                          export_normals=True, export_materials="EXPORT", use_selection=False)
print("wrote", OUT)
for o in SC.objects:
    me = o.data
    me.calc_loop_triangles()
    print(" ", o.name, len(me.loop_triangles), "tris")

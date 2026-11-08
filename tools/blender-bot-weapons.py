#!/usr/bin/env python3
"""Build the weapon parts (models/bot-weapons.glb) in Blender from code. Original work for Scrapline (Longlight Interactive).

  python3 -m venv /tmp/bvenv && /tmp/bvenv/bin/pip install bpy           # Blender as a Python module (bpy 5.x, Python 3.13)
  /tmp/bvenv/bin/python tools/blender-bot-weapons.py /tmp/wpk/wp.gltf    # writes a .gltf + .bin
  python3 tools/pack-model.py /tmp/wpk/wp.gltf models/bot-weapons.glb    # quantize and pack, as for every model

On Full and Ultra, vis/bot.js buildWeapon swaps these in for the coded weapon boxes (Lite keeps the code). Each piece is
one top-level object the game picks by name and stretches to the weapon, so each is modelled in its own UNIT BOX, given
below as the three.js axes (y up, the bot's front at -z) and what the game scales each axis by. The game puts its own
materials on (the disc material on a disc body, steel on teeth and fittings, aluminium on arms and plates), so the colours
here are only for looking at it in Blender. Round things on an axis the game stretches unevenly are drawn pre-squashed
so they come out round on a typical bot.
  wp_disc        a spinner's disc: radius 1 in x and z, thickness 1 in y (y -0.5..0.5). Chamfered rim, four lightening
                 holes between the teeth. Used flat (horizontal disc, undercutter) and turned on its side (vertical disc)
  wp_disc_teeth  the disc's two hooked teeth at +x and -x, standing out to radius 1.14, 1.5 thick
  wp_disc_hub    a raised boss at the centre (radius 0.19, 1.9 thick) and wp_disc_bolts, six bolt heads on it, both faces
  wp_saw         a thin saw blade, radius 1 at the tooth tips: 32 raked teeth round the edge
  wp_drum        a drum along x: x -0.5..0.5 is its width, radius 1 in y and z; chamfered ends and three grip grooves
  wp_drum_teeth  its striker teeth: two at the top, three at the bottom, staggered, chisel tipped, out to radius 1.27
  wp_upright     a side plate that holds a disc or drum: x -0.5..0.5 its thickness, y and z -0.5..0.5 scaled by 1.2 and
                 0.8 of the weapon's radius; a bearing boss through it at the axle (z -0.3125)
  wp_ramp        a wedge or ramp plate: x the width, y the thickness, z the length along the slope (front at -z), each
                 -0.5..0.5; the front edge is ground to a knife edge over the last 8%
  wp_fork        one lifter tine: x and y -0.5..0.5 its width and thickness, z -0.5..0.5 its length; narrows and thins to
                 a chisel tip at the front
  wp_flip        a flipper plate: x -0.5..0.5 its width, z -1..0 its length (the hinge at z 0), y in the same unit as z
                 (the game scales y and z alike). A 0.02 plate with a sharpened tip, three ribs under it and hinge knuckles
  wp_beam        an arm: x and y -0.5..0.5 its section, z -1..0 its length (the pivot at z 0); a box tube with six round
                 lightening holes through its sides and a pivot boss, drawn round for an arm about 24 times its depth
  wp_hammer_head a hammer head: a box -0.5..0.5 each way, the top two thirds a chamfered block, the bottom an axe blade
                 down to an edge along x; clamp bolts on both sides
  wp_beak        a crusher's beak, -0.5..0.5 each way: a claw hooking down and forward to a point
  wp_jaw         the crusher's lower jaw: x and z -0.5..0.5, y -0.5..0.5 a plate, three teeth up to y 2.5 near its front
Nothing random. Lite never loads the file; until it lands (or if it fails) the coded shapes stand in.
"""
import math, sys
import bpy, bmesh

OUT = sys.argv[-1] if sys.argv[-1].endswith(".gltf") else "/tmp/bot-weapons.gltf"

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


DISC = mat("wp-disc", 0x5a5f66, 1.0, 0.3)
STEEL = mat("wp-steel", 0xb8bcc2, 1.0, 0.35)
ALU = mat("wp-alu", 0xc9ccd0, 1.0, 0.45)


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


# ---- the disc: radius 1, y -0.5..0.5 ----
disc = lathe("wp_disc", [(0, 0.5), (0.86, 0.5), (1.0, 0.1), (1.0, -0.1), (0.86, -0.5), (0, -0.5)], 64, DISC)
cut(disc, [cyl(0.13, 2, (math.cos(a) * 0.55, 0, math.sin(a) * 0.55), "y", 24) for a in (math.pi / 4, 3 * math.pi / 4, 5 * math.pi / 4, 7 * math.pi / 4)])
smooth(disc)


def tooth(a, y0, y1):
    """a hooked tooth on the rim at angle a: radial u 0.8..1.14, tangential v; the hook leads at +v"""
    pr = [(0.8, -0.11), (1.05, -0.11), (1.14, 0.0), (1.12, 0.13), (0.8, 0.13)]
    pts = []
    c, s = math.cos(a), math.sin(a)
    for u, w in pr:
        pts.append((u * c - w * s, u * s + w * c))
    return prism("t", pts, y0, y1, STEEL, "y")


join("wp_disc_teeth", [tooth(0, -0.75, 0.75), tooth(math.pi, -0.75, 0.75)], STEEL)
smooth(lathe("wp_disc_hub", [(0, 0.95), (0.15, 0.95), (0.19, 0.83), (0.19, -0.83), (0.15, -0.95), (0, -0.95)], 32, STEEL))
bolts = []
for k in range(6):
    t = 2 * math.pi * (k + 0.5) / 6
    for y in (1.0, -1.0):
        bolts.append(cyl(0.028, 0.14, (math.cos(t) * 0.105, y, math.sin(t) * 0.105), "y", 6))
join("wp_disc_bolts", bolts, STEEL)

# ---- the saw: 32 raked teeth, tips at radius 1 ----
N = 32
pts = []
for k in range(N):
    t0 = 2 * math.pi * k / N
    t1 = 2 * math.pi * (k + 0.78) / N
    t2 = 2 * math.pi * (k + 1) / N
    pts += [(math.cos(t0) * 0.9, math.sin(t0) * 0.9), (math.cos(t1) * 1.0, math.sin(t1) * 1.0), (math.cos(t2 - 1e-3) * 0.92, math.sin(t2 - 1e-3) * 0.92)]
saw = prism("wp_saw", pts, -0.5, 0.5, DISC, "y")
cut(saw, [cyl(0.05, 2, (math.cos(a) * 0.62, 0, math.sin(a) * 0.62), "y", 12) for a in (0.3, 0.3 + math.pi / 2, 0.3 + math.pi, 0.3 + 3 * math.pi / 2)])

# ---- the drum: along x, radius 1 ----
dp = [(0, -0.5), (0.86, -0.5), (1.0, -0.43)]
for g in (-0.2, 0.0, 0.2):
    dp += [(1.0, g - 0.035), (0.95, g - 0.015), (0.95, g + 0.015), (1.0, g + 0.035)]
dp += [(1.0, 0.43), (0.86, 0.5), (0, 0.5)]
smooth(lathe("wp_drum", dp, 48, STEEL, axis="x"))


def chisel(xc, w, up):
    """a striker tooth: in (z, y) from the drum's skin (0.9) out to 1.27, chisel edge leading at -z; up False for the bottom"""
    pr = [(0.15, 0.9), (0.15, 1.12), (0.02, 1.27), (-0.15, 1.2), (-0.15, 0.9)]
    if not up:
        pr = [(-z, -y) for z, y in pr][::-1]
    return prism("d", pr, xc - w / 2, xc + w / 2, STEEL, "x")


join("wp_drum_teeth", [chisel(-0.24, 0.26, True), chisel(0.24, 0.26, True), chisel(-0.38, 0.18, False), chisel(0.0, 0.18, False), chisel(0.38, 0.18, False)], STEEL)

# ---- the upright: plate with chamfered corners, bearing boss at the axle ----
up = prism("p", [(0.5, -0.5), (0.5, 0.3), (0.3, 0.5), (-0.3, 0.5), (-0.5, 0.3), (-0.5, -0.5)], -0.5, 0.5, STEEL, "x")
boss = cyl(0.25, 1.8, (0, 0, -0.3125), "x", 20, 1.0, 1.5)   # radius .25 of y, .375 of z: round on a 1.2 x .8 plate
o = join("wp_upright", [up, boss], STEEL)
smooth(o)

# ---- the ramp: a plate, knife edge at the front ----
prism("wp_ramp", [(0.5, 0.5), (-0.42, 0.5), (-0.5, -0.5), (0.5, -0.5)], -0.5, 0.5, STEEL, "x")

# ---- a lifter tine ----
fk = prism("wp_fork", [(0.5, 0.5), (-0.2, 0.5), (-0.5, -0.25), (-0.5, -0.5), (0.5, -0.5)], -0.5, 0.5, STEEL, "x")
for vv in fk.data.vertices:                      # Blender: y = -three z
    z = -vv.co.y
    if z < -0.2:
        vv.co.x *= 1 - 0.45 * (-0.2 - z) / 0.3

# ---- the flipper plate: z -1 (tip) .. 0 (hinge), y in the same unit ----
plate = prism("f", [(0.0, 0.01), (-0.96, 0.01), (-1.0, -0.01), (0.0, -0.01)], -0.5, 0.5, ALU, "x")
parts = [plate]
for xc in (-0.36, 0.0, 0.36):
    parts.append(prism("r", [(-0.05, -0.01), (-0.85, -0.01), (-0.6, -0.035), (-0.05, -0.07)], xc - 0.02, xc + 0.02, ALU, "x"))
for xc in (-0.4, 0.0, 0.4):
    parts.append(cyl(0.03, 0.12, (xc, -0.02, -0.01), "x", 12))
join("wp_flip", parts, ALU)

# ---- the arm: a box tube z -1..0, holes through x, a pivot boss ----
R = 24.0                                         # the arm's length over its depth, roughly: what the holes are drawn round for
beam = prism("wp_beam", [(0.0, 0.5), (-1.0, 0.5), (-1.0, -0.5), (0.0, -0.5)], -0.5, 0.5, ALU, "x")
cut(beam, [cyl(0.28, 2, (0, 0, -0.18 - 0.12 * i), "x", 16, 1.0, 1 / R) for i in range(6)])
pv = cyl(0.62, 1.3, (0, 0, -0.03), "x", 20, 1.0, 1 / R)
join("wp_beam", [beam, pv], ALU)

# ---- the hammer head: block over an axe blade ----
blk = prism("h", [(0.5, 0.5), (0.5, -0.1), (-0.5, -0.1), (-0.5, 0.5)], -0.5, 0.5, STEEL, "x")
blade = prism("b", [(0.5, -0.1), (0.08, -0.5), (-0.08, -0.5), (-0.5, -0.1)], -0.46, 0.46, STEEL, "x")
hb = [blk, blade]
for sx in (-1, 1):
    for z in (-0.25, 0.25):
        hb.append(cyl(0.11, 0.12, (sx * 0.5, 0.22, z), "x", 6, 1.0, 1.25))   # .11 of y and .14 of z: round on a .02 x .016 head
join("wp_hammer_head", hb, STEEL)

# ---- the crusher's beak ----
bk = prism("wp_beak", [(0.5, 0.5), (-0.15, 0.5), (-0.45, 0.25), (-0.5, -0.1), (-0.32, -0.5), (-0.12, -0.18), (0.2, -0.08), (0.5, 0.05)], -0.5, 0.5, STEEL, "x")
for vv in bk.data.vertices:
    y = vv.co.z
    if y < 0:
        vv.co.x *= 1 - 0.5 * (-y) / 0.5

# ---- the crusher's jaw ----
jp = [prism("j", [(0.5, 0.5), (-0.5, 0.5), (-0.5, -0.5), (0.5, -0.5)], -0.5, 0.5, STEEL, "x")]
for xc in (-0.3, 0.0, 0.3):
    jp.append(prism("jt", [(-0.05, 0.5), (-0.42, 0.5), (-0.36, 2.5)], xc - 0.06, xc + 0.06, STEEL, "x"))
join("wp_jaw", jp, STEEL)

bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLTF_SEPARATE", export_apply=True, export_yup=True,
                          export_normals=True, export_materials="EXPORT", use_selection=False)
print("wrote", OUT)

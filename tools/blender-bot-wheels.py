#!/usr/bin/env python3
"""Build the wheel layouts' parts (models/bot-wheels.glb) in Blender from code. Original work for Scrapline (Longlight Interactive).

  python3 -m venv /tmp/bvenv && /tmp/bvenv/bin/pip install bpy           # Blender as a Python module (bpy 5.x, Python 3.13)
  /tmp/bvenv/bin/python tools/blender-bot-wheels.py /tmp/whk/wh.gltf     # writes a .gltf + .bin
  python3 tools/pack-model.py /tmp/whk/wh.gltf models/bot-wheels.glb     # quantize and pack, as for every model

On Full and Ultra, vis/bot.js swaps these in for the coded wheel parts of the 0.1.31 wheel layouts (Lite keeps the code).
Each piece is one top-level object the game picks by name and stretches, so each is modelled in its own unit, given below
as three.js axes (y up, the bot's front at -z), with its origin on the wheel's axle. The game puts its own materials on
(rubber on rollers, aluminium on plates and forks, steel on fittings), so the colours here are only for Blender.
  wh_mec_hub      a mecanum wheel's side plates and hub: the axle along x, x -0.5..0.5 the wheel's width (the game scales x
                  by the tyre width), y and z the radius (scaled by the wheel radius). Two ten-sided plates at the faces, a
                  hub between them and a bolt at each roller's ends
  wh_mec_rollers  its ten barrel rollers, each at 45 degrees to the axle, out to radius 1
  wh_swerve       a swerve pod: a fork round the wheel (legs outside x +-0.5, the tyre's width being 0.8 of a unit, so the
                  game scales x by the tyre width / 0.8 and y and z by the wheel radius), a bridge over the tyre, a toothed
                  turntable on top and the steering servo beside it
  wh_caster       a swivel caster, all three axes in caster-wheel radii: the fork's legs from the axle up to a crown that
                  trails the swivel by 0.35 (the swivel ahead of the axle, at z -0.35), the swivel bearing and a square
                  mount plate on top at y 1.6..1.68 with four bolt heads. The wheel itself stays coded (it turns)
Nothing random. Lite never loads the file; until it lands (or if it fails) the coded shapes stand in.
"""
import math, sys
import bpy, bmesh

OUT = sys.argv[-1] if sys.argv[-1].endswith(".gltf") else "/tmp/bot-wheels.gltf"

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


RUB = mat("wh-rubber", 0x2a2a2c, 0.0, 0.85)
STEEL = mat("wh-steel", 0xb8bcc2, 1.0, 0.35)
ALU = mat("wh-alu", 0xc9ccd0, 1.0, 0.45)


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


# ---- the mecanum wheel: plates and hub, then the rollers ----
NR = 10
RC = 0.78                                        # the rollers' centres; their bellies reach radius 1
hub = [lathe("p", [(0, 0.5), (0.8, 0.5), (0.8, 0.4), (0, 0.4)], NR, ALU, "x"),
       lathe("p", [(0, -0.4), (0.8, -0.4), (0.8, -0.5), (0, -0.5)], NR, ALU, "x"),
       lathe("h", [(0, 0.4), (0.3, 0.4), (0.3, -0.4), (0, -0.4)], 16, ALU, "x")]
for i in range(NR):
    t = 2 * math.pi * (i + 0.5) / NR
    for sx in (-1, 1):
        hub.append(cyl(0.06, 0.06, (sx * 0.52, math.cos(t) * 0.7, math.sin(t) * 0.7), "x", 6))
join("wh_mec_hub", hub, ALU)
s2 = math.sqrt(0.5)
rollers = []
for i in range(NR):
    t = 2 * math.pi * i / NR
    rd = (0.0, math.cos(t), math.sin(t))                     # out from the axle
    tg = (0.0, -math.sin(t), math.cos(t))                    # round the wheel
    ax = (s2, s2 * tg[1], s2 * tg[2])                        # the roller's own axis, 45 degrees between the axle and tg
    bx = (s2, -s2 * tg[1], -s2 * tg[2])

    def frame(u, p, q, rd=rd, ax=ax, bx=bx):
        return tuple(RC * rd[k] + u * ax[k] + p * rd[k] + q * bx[k] for k in range(3))
    rollers.append(barrel([(0, -0.46), (0.1, -0.46), (0.17, -0.3), (0.215, -0.1), (0.22, 0), (0.215, 0.1), (0.17, 0.3),
                           (0.1, 0.46), (0, 0.46)], 12, frame, RUB, "r"))
smooth(join("wh_mec_rollers", rollers, RUB), 50)

# ---- the swerve pod ----
sw = []
for sx in (-1, 1):
    sw.append(prism("leg", [(-0.24, -0.08), (0.24, -0.08), (0.42, 1.18), (-0.42, 1.18)], sx * 0.5, sx * 0.6, ALU, "x"))
    sw.append(cyl(0.16, 0.12, (sx * 0.62, 0, 0), "x", 12))                  # the axle's bearing caps
sw.append(box(-0.6, 0.6, 1.18, 1.3, -0.45, 0.45, ALU))                       # the bridge over the tyre
sw.append(lathe("tt", [(0, 1.42), (0.5, 1.42), (0.5, 1.3), (0, 1.3)], 32, STEEL, "y"))
for k in range(28):                                                          # the turntable's gear teeth
    a = 2 * math.pi * k / 28
    c, s = math.cos(a), math.sin(a)
    sw.append(mesh_obj("t", [(c * 0.48 - s * 0.035, 1.31, s * 0.48 + c * 0.035), (c * 0.58 - s * 0.025, 1.31, s * 0.58 + c * 0.025),
                             (c * 0.58 + s * 0.025, 1.31, s * 0.58 - c * 0.025), (c * 0.48 + s * 0.035, 1.31, s * 0.48 - c * 0.035),
                             (c * 0.48 - s * 0.035, 1.41, s * 0.48 + c * 0.035), (c * 0.58 - s * 0.025, 1.41, s * 0.58 + c * 0.025),
                             (c * 0.58 + s * 0.025, 1.41, s * 0.58 - c * 0.025), (c * 0.48 + s * 0.035, 1.41, s * 0.48 - c * 0.035)],
                       [[3, 2, 1, 0], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]], STEEL))
sw.append(box(-0.3, 0.3, 1.42, 1.72, 0.1, 0.55, ALU))                        # the steering servo
sw.append(cyl(0.12, 0.2, (0, 1.52, -0.05), "y", 12))                         # its output shaft and pinion
join("wh_swerve", sw, ALU)

# ---- the swivel caster ----
cs = []
for sx in (-1, 1):
    cs.append(prism("leg", [(-0.22, -0.1), (0.2, -0.1), (-0.15, 1.3), (-0.6, 1.3)], sx * 0.36, sx * 0.46, STEEL, "x"))
cs.append(cyl(0.11, 1.04, (0, 0, 0), "x", 12))                                # the axle bolt
cs.append(box(-0.46, 0.46, 1.3, 1.42, -0.68, -0.08, STEEL))                   # the crown
br = lathe("sv", [(0, 1.6), (0.3, 1.6), (0.36, 1.5), (0.3, 1.42), (0, 1.42)], 20, STEEL, "y")
for vv in br.data.vertices:
    vv.co.y += 0.35                                                           # Blender y is three -z: the swivel sits ahead
cs.append(br)
cs.append(box(-0.55, 0.55, 1.6, 1.68, -0.9, 0.2, STEEL))                      # the mount plate
for bx_ in (-0.42, 0.42):
    for bz in (-0.77, 0.07):
        cs.append(cyl(0.07, 0.06, (bx_, 1.7, bz), "y", 6))
join("wh_caster", cs, STEEL)

bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLTF_SEPARATE", export_apply=True, export_yup=True,
                          export_normals=True, export_materials="EXPORT", use_selection=False)
print("wrote", OUT)

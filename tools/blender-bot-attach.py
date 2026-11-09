#!/usr/bin/env python3
"""Build the 0.1.32 attachments (models/bot-attach.glb) in Blender from code. Original work for Scrapline (Longlight Interactive).

  python3 -m venv /tmp/bvenv && /tmp/bvenv/bin/pip install bpy           # Blender as a Python module (bpy 5.x, Python 3.13)
  /tmp/bvenv/bin/python tools/blender-bot-attach.py /tmp/atk/at.gltf     # writes a .gltf + .bin
  python3 tools/pack-model.py /tmp/atk/at.gltf models/bot-attach.glb     # quantize and pack, as for every model

On Full and Ultra, vis/bot.js buildAttach swaps these in for the coded boxes of the front attachments, the back slot and
the grabber's top jaw (Lite keeps the code). Like the weapon parts, each piece is one top-level object modelled in its own
unit box, x, y and z each -0.5..0.5 in three.js axes (y up, the bot's front at -z), and the game stretches that box to the
size it wants, so the sim's sizes still rule. The game puts its own materials on, so the colours here are only for Blender.
  at_wedgelets   two short ramps, one at each front corner (x +-0.2..0.5): the tip on the floor at the front (z -0.5),
                 rising to the full height at the back, with two bolt heads on each
  at_forks       four tines (each 0.09 wide) whose sharpened tips touch the floor at the front, joined by a cross bar at
                 the back
  at_plow        a curved scoop across the whole width, its lip on the floor at the front curving up to the top at the
                 back, with a side cheek at each end
  at_spike       a turned spike pointing forwards (its point at z -0.5) on a square base plate at the back
  at_rearwedge   a ramp the whole width, the tip on the floor at the back (z +0.5), rising towards the front
  at_rearspike   two short spikes pointing backwards (+z) on a base plate at the front of the box
  at_kick        the back-up flipper's plate: a slab the whole width with three hinge knuckles along its front edge (z -0.5),
                 hinged there; the game swings it up when it fires
  gr_jaw         the grabber's top jaw: two side arms from the hinge at the back (z +0.5, the top of the box) hooking down
                 to the front, joined at the tip by a toothed bar whose teeth reach the bottom of the box
Nothing random. Lite never loads the file; until it lands (or if it fails) the coded shapes stand in.
"""
import math, sys
import bpy, bmesh

OUT = sys.argv[-1] if sys.argv[-1].endswith(".gltf") else "/tmp/bot-attach.gltf"

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


STEEL = mat("at-steel", 0xb8bcc2, 1.0, 0.35)
ALU = mat("at-alu", 0xc9ccd0, 1.0, 0.45)


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


# ---- front attachments ----
wl = []
for s in (-1, 1):
    x0, x1 = (0.2, 0.5) if s > 0 else (-0.5, -0.2)
    wl.append(prism("w", [(-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (0.3, 0.5)], x0, x1, STEEL, "x"))
    for bz in (0.1, 0.38):
        yy = -0.5 + (bz + 0.5) / 0.8 * 1.0 if bz < 0.3 else 0.5
        wl.append(bolt((x0 + x1) / 2, min(0.5, yy) - 0.01, bz, 0.035, 0.03))
join("at_wedgelets", wl, STEEL)

fk = []
for x in (-0.375, -0.125, 0.125, 0.375):
    fk.append(prism("t", [(-0.5, -0.5), (-0.3, -0.38), (0.5, -0.1), (0.5, 0.28), (0.3, 0.28), (-0.35, -0.45)], x - 0.045, x + 0.045, STEEL, "x"))
fk.append(box(-0.5, 0.5, -0.12, 0.3, 0.32, 0.5, STEEL))
for x in (-0.375, -0.125, 0.125, 0.375):
    fk.append(bolt(x, 0.3, 0.41, 0.035, 0.03))
join("at_forks", fk, STEEL)

pl = []
curve = []
for i in range(13):
    t = i / 12
    a = t * math.pi / 2
    z = -0.5 + (1 - math.cos(a)) * 1.0      # the lip at the front, the back at z +0.5
    y = -0.5 + math.sin(a) * 1.0
    curve.append((z, y))
inner = [(z + 0.11 * math.sin(i / 12 * math.pi / 2), y - 0.11 * (1 - math.sin(i / 12 * math.pi / 2)) + 0.0) for i, (z, y) in enumerate(curve)]
prof = [(z, y) for z, y in curve] + [(min(0.5, z + 0.1), max(-0.5, y - 0.1)) for z, y in reversed(curve)]
pl.append(prism("s", [(-0.5, -0.5)] + [(z, y) for z, y in curve[1:]] + [(0.5, 0.38)] + [(z + 0.12, y - 0.12) for z, y in reversed(curve[1:-1])] + [(-0.38, -0.5)], -0.5, 0.5, STEEL, "x"))
for s in (-0.5, 0.44):
    pl.append(prism("c", [(-0.3, -0.5), (0.5, -0.5), (0.5, 0.4), (0.25, 0.4)], s, s + 0.06, STEEL, "x"))
for x in (-0.3, 0.0, 0.3):
    pl.append(bolt(x, 0.1, 0.47, 0.04, 0.03, "z"))
join("at_plow", pl, STEEL)

sp = [barrel([(0, 0), (0.42, 0), (0.42, 0.12), (0.3, 0.2), (0.12, 0.6), (0.02, 0.95), (0, 1.0)], 20, along_z(0.5, -0.5, 0, 0), STEEL, "sp")]
sp.append(box(-0.5, 0.5, -0.5, 0.5, 0.42, 0.5, STEEL))
for x in (-0.38, 0.38):
    for y in (-0.38, 0.38):
        sp.append(barrel([(0, 0), (0.06, 0), (0.06, 0.04), (0, 0.04)], 6, along_z(0.42, -0.5, x, y), STEEL, "bolt"))
smooth(join("at_spike", sp, STEEL), 40)

# ---- the back slot ----
rw = [prism("w", [(0.5, -0.5), (-0.5, -0.5), (-0.5, 0.5), (-0.3, 0.5)], -0.5, 0.5, STEEL, "x")]
for x in (-0.3, 0.3):
    rw.append(bolt(x, 0.49, -0.42, 0.04, 0.03))
join("at_rearwedge", rw, STEEL)

rs = [box(-0.5, 0.5, -0.5, 0.5, -0.5, -0.4, STEEL)]
for x in (-0.3, 0.3):
    rs.append(barrel([(0, 0), (0.2, 0), (0.2, 0.08), (0.14, 0.16), (0.05, 0.75), (0, 0.9)], 16, along_z(-0.4, 0.5, x, 0), STEEL, "sp"))
smooth(join("at_rearspike", rs, STEEL), 40)

kk = [box(-0.5, 0.5, -0.25, 0.25, -0.38, 0.5, ALU)]
for x in (-0.38, 0.0, 0.38):
    kk.append(barrel([(0, -0.08), (0.5, -0.08), (0.5, 0.08), (0, 0.08)], 12, lambda u, p, q, x=x: (x + u * 1.0, p, -0.4 + q * 0.2), ALU, "k"))
kk.append(box(-0.42, 0.42, 0.25, 0.4, 0.3, 0.45, ALU))       # a lip at the tip
join("at_kick", kk, ALU)

# ---- the grabber's top jaw ----
jw = []
for s in (-1, 1):
    x0, x1 = (0.32, 0.46) if s > 0 else (-0.46, -0.32)
    jw.append(prism("arm", [(0.5, 0.3), (0.5, 0.5), (-0.3, 0.5), (-0.5, 0.2), (-0.5, -0.2), (-0.38, -0.2), (-0.38, 0.28), (-0.22, 0.3)], x0, x1, ALU, "x"))
jw.append(box(-0.5, 0.5, -0.25, 0.05, -0.5, -0.36, STEEL))     # the bar across the tip
for i in range(6):                                             # its teeth
    x = -0.42 + i * 0.168
    jw.append(mesh_obj("t", [(x - 0.06, -0.25, -0.5), (x + 0.06, -0.25, -0.5), (x + 0.06, -0.25, -0.36), (x - 0.06, -0.25, -0.36),
                             (x, -0.5, -0.43)], [[3, 2, 1, 0], [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]], STEEL))
jw.append(barrel([(0, -0.5), (0.1, -0.5), (0.1, 0.5), (0, 0.5)], 12, lambda u, p, q: (u, 0.4 + p, 0.4 + q), STEEL, "hinge"))
join("gr_jaw", jw, ALU)

bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLTF_SEPARATE", export_apply=True, export_yup=True,
                          export_normals=True, export_materials="EXPORT", use_selection=False)
print("wrote", OUT)

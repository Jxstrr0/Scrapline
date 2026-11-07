#!/usr/bin/env python3
"""Build the body-style shells (models/bot-shells.glb) in Blender from code. Original work for Scrapline (Longlight Interactive).

  python3 -m venv /tmp/bvenv && /tmp/bvenv/bin/pip install bpy          # Blender as a Python module (bpy 5.x, Python 3.13)
  /tmp/bvenv/bin/python tools/blender-bot-shells.py /tmp/shells.gltf    # writes a .gltf + .bin
  python3 tools/pack-model.py /tmp/shells.gltf models/bot-shells.glb    # quantize and pack, as for every model

On Full and Ultra, vis/bot.js swaps these in for the coded body shapes (Lite keeps the code). Each piece is one top-level
object the game picks by name and stretches to the bot, so every piece is modelled in a UNIT BODY: x -0.5..0.5 is the
bot's width, z -0.5..0.5 its length (front at -z, as the game's bot), and y is in chassis heights with y 0 the top of the
box (y -1 its bottom). The game recolours every piece with its own materials (the armour or chassis of the face it covers,
steel for fasteners), so the colours here are only for looking at it in Blender. Coordinates below are three.js's (y up);
B() turns them into Blender's (z up).
Because the game stretches a unit body to a real one (a beetle is about 0.9 wide and 0.25 high for 1 long), round things
like bolt heads are drawn pre-squashed by REF so they come out round on a typical bot.
  wedge_top     the wedge shell's sloping lid: a plate from the back top (y 0) down to the front (y -0.6), two ribs, a
                sharpened front lip; wedge_bolts its bolt heads; wedge_cheek_l / _r the side cheeks under the slope
  dome_shell    the dome: a half ellipsoid from y -0.3 to y 0.5 with a rim flange and a ridge; dome_bolts round the rim
  slab_skirt_l / _r   thick side skirts with a bevelled top; slab_bolts_l / _r; slab_guard a corner guard (its own unit:
                the corner at the origin, the bot in -x -z, scaled by the guard's size in x and z and the chassis height in y)
  pancake_lid   a wide flat lid (y 0..0.12) with chamfered edges and an access panel; pancake_bolts
  invert_plate  the same plate top and bottom (y 0..0.09, the game mirrors it underneath); invert_bolts
  scrap_tube    one frame tube, unit radius and unit length along y (the game scales it like its coded tubes);
  scrap_weld    a lumpy weld blob, unit radius, for the joints
Nothing random: the weld lumps are laid out from a fixed seed.
"""
import math, random, sys
import bpy, bmesh

OUT = sys.argv[-1] if sys.argv[-1].endswith(".gltf") else "/tmp/bot-shells.gltf"
REF = (0.9, 0.25, 1.0)   # a typical body's width, height, length in lengths: fasteners are pre-squashed by it

bpy.ops.wm.read_factory_settings(use_empty=True)
SC = bpy.context.scene


def lin(h):
    def c(v):
        v /= 255.0
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (c((h >> 16) & 255), c((h >> 8) & 255), c(h & 255), 1.0)


def mat(name, hexc, metal=0.0, rough=0.7):
    m = bpy.data.materials.new(name)
    if hasattr(m, "use_nodes") and not m.node_tree:
        m.use_nodes = True
    p = m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = lin(hexc)
    p.inputs["Metallic"].default_value = metal
    p.inputs["Roughness"].default_value = rough
    return m


PLATE = mat("shell-plate", 0x8a8f96, 1.0, 0.45)
STEEL = mat("shell-steel", 0xb8bcc2, 1.0, 0.35)


def B(x, y, z):
    return (x, -z, y)


def mesh_obj(name, verts, faces, m):
    """an object from three.js-space vertices and faces (each face counter-clockwise seen from outside)"""
    me = bpy.data.meshes.new(name)
    me.from_pydata([B(*v) for v in verts], [], faces)
    me.validate()
    me.update()
    o = bpy.data.objects.new(name, me)
    SC.collection.objects.link(o)
    o.data.materials.append(m)
    return o


def recalc(o):
    """outward normals, flat shading (hard-edged plate)"""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    for p in o.data.polygons:
        p.use_smooth = False


def prism_x(name, prof, x0, x1, m):
    """a 2D profile [(z, y), ...] extruded along x from x0 to x1"""
    n = len(prof)
    v = [(x0, y, z) for z, y in prof] + [(x1, y, z) for z, y in prof]
    f = [list(range(n))[::-1], list(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        f.append([i, j, n + j, n + i])
    o = mesh_obj(name, v, f, m)
    recalc(o)
    return o


def prism_z(name, prof, z0, z1, m):
    """a 2D profile [(x, y), ...] extruded along z from z0 to z1"""
    n = len(prof)
    v = [(x, y, z0) for x, y in prof] + [(x, y, z1) for x, y in prof]
    f = [list(range(n))[::-1], list(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        f.append([i, j, n + j, n + i])
    o = mesh_obj(name, v, f, m)
    recalc(o)
    return o


def frustum(name, bx, bz, tx, tz, y0, y1, ys, m):
    """a chamfered slab: straight sides from y0 to ys at half size (bx, bz), then a chamfer to (tx, tz) at y1"""
    rings = [(bx, bz, y0), (bx, bz, ys), (tx, tz, y1)]
    v = []
    for hx, hz, y in rings:
        v += [(-hx, y, -hz), (hx, y, -hz), (hx, y, hz), (-hx, y, hz)]
    f = [[3, 2, 1, 0], [8, 9, 10, 11]]
    for r in range(2):
        a, b = r * 4, r * 4 + 4
        for i in range(4):
            j = (i + 1) % 4
            f.append([a + i, a + j, b + j, b + i])
    o = mesh_obj(name, v, f, m)
    recalc(o)
    return o


def bolt(r, h, x, y, z, axis="y", n=6, ref=REF):
    """a bolt head: a short cylinder r across (in lengths, pre-squashed by ref so a stretched body shows it round) and h
    along its axis (in that axis's own unit)"""
    bpy.ops.mesh.primitive_cylinder_add(vertices=n, radius=1, depth=1, location=B(x, y, z))
    o = bpy.context.object
    sx, sy, sz = r / ref[0], r / ref[1], r / ref[2]
    if axis == "y":
        sy = h
        o.scale = (sx, sz, sy)          # Blender axes: x, y (= -three z), z (= three y)
    elif axis == "x":
        sx = h
        o.rotation_euler = (0, math.pi / 2, 0)
        o.scale = (sy, sz, sx)          # after the turn, local z is world x
    else:
        sz = h
        o.rotation_euler = (math.pi / 2, 0, 0)
        o.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return o


def join(name, parts, m):
    """merge parts into one object, every vertex where it was: transforms are applied first, so the result's origin is the
    unit body's origin (the game places a piece by its origin)"""
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
        p.data.materials.clear()
        p.data.materials.append(m)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    o = bpy.context.object
    o.name = name
    o.data.name = name
    return o


# ---- the wedge shell: back top (z 0.5, y 0) down to the front (z -0.5, y -0.6) ----
T = 0.07                                      # plate thickness, in chassis heights


def slope(z):
    return -0.3 + 0.6 * z


top = [prism_x("w", [(0.5, 0), (-0.5, -0.6), (-0.47, -0.6 + T), (0.5, T)], -0.49, 0.49, PLATE)]
for zc in (0.18, -0.16):                      # two stiffening ribs across the slope
    a, b = zc - 0.035, zc + 0.035
    top.append(prism_x("w", [(b, slope(b) + T), (a, slope(a) + T), (a, slope(a) + T + 0.06), (b, slope(b) + T + 0.06)], -0.42, 0.42, PLATE))
top.append(prism_x("w", [(0.5, T), (0.44, T), (0.44, T + 0.05), (0.5, T + 0.05)], -0.49, 0.49, PLATE))   # a hinge strip at the back
join("wedge_top", top, PLATE)
bl = []
for x in (-0.43, 0.43):
    for zc in (0.38, 0.05, -0.28):
        bl.append(bolt(0.02, 0.05, x, slope(zc) + T, zc))
for x in (-0.25, 0, 0.25):
    bl.append(bolt(0.018, 0.05, x, T + 0.05, 0.47))
join("wedge_bolts", bl, STEEL)
for s, nm in ((-1, "wedge_cheek_l"), (1, "wedge_cheek_r")):
    x0, x1 = (-0.5, -0.47) if s < 0 else (0.47, 0.5)
    c = prism_x(nm, [(0.5, -0.6), (0.5, 0.0), (-0.5, -0.6)], x0, x1, PLATE)
    lip = prism_x("c", [(0.5, -0.66), (0.5, -0.6), (-0.5, -0.6), (-0.5, -0.66)], x0 - s * 0.005, x1 + s * 0.005, PLATE)
    join(nm, [c, lip], PLATE)

# ---- the dome: a half ellipsoid over the box, y -0.3..0.5, a rim flange ----
bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1, location=(0, 0, 0))
d = bpy.context.object
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="DESELECT")
bpy.ops.object.mode_set(mode="OBJECT")
for v in d.data.vertices:
    v.select = v.co.z < -1e-4
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.delete(type="VERT")
bpy.ops.object.mode_set(mode="OBJECT")
d.scale = (0.51, 0.5, 0.8)
d.location = B(0, -0.3, 0)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for p in d.data.polygons:
    p.use_smooth = True
d.data.materials.append(PLATE)
rim = []
bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=1, depth=1, location=B(0, -0.33, 0))
r = bpy.context.object
r.scale = (0.545, 0.53, 0.07)
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
rim.append(r)
ridge = prism_z("r", [(-0.03, 0), (0.03, 0), (0.02, 0.04), (-0.02, 0.04)], -0.42, 0.42, PLATE)   # a seam along the crown
for v in ridge.data.vertices:          # bend it onto the dome's surface (Blender z is three's y, y is -three's z)
    zz = -v.co.y
    k = max(0.0, 1 - (zz / 0.51) ** 2)
    v.co.z += -0.3 + 0.8 * math.sqrt(k) - 0.01
rim.append(ridge)
dome = join("dome_shell", [d] + rim, PLATE)
bl = []
for i in range(14):
    a = i * 2 * math.pi / 14
    bl.append(bolt(0.02, 0.05, math.cos(a) * 0.525, -0.3 + 0.03, math.sin(a) * 0.515))
join("dome_bolts", bl, STEEL)

# ---- the slab: thick side skirts, corner guards ----
for s, nm in ((-1, "l"), (1, "r")):
    prof = [(0.5, -0.97), (0.5 + 0.05, -0.97), (0.5 + 0.05, -0.12), (0.5 + 0.02, -0.03), (0.5, -0.03)]
    prof = [(s * x, y) for x, y in prof]
    sk = prism_z("slab_skirt_" + nm, prof, -0.47, 0.47, PLATE)
    bl = [bolt(0.022, 0.03, s * 0.55, y, z, "x") for z in (-0.35, -0.12, 0.12, 0.35) for y in (-0.3, -0.7)]
    join("slab_bolts_" + nm, bl, STEEL)
# the guard: the corner at the origin, the bot in -x -z; x and z in the guard's own size, y in chassis heights (0 bottom, 1 top)
g = [prism_z("g", [(0, 0), (0.22, 0), (0.22, 1.02), (0, 1.02)], -1.0, 0.0, STEEL),
     prism_x("g", [(0, 0), (0.22, 0), (0.22, 1.02), (0, 1.02)], -1.0, 0.0, STEEL)]
bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.22, depth=1.02, location=B(0, 0.51, 0))
g.append(bpy.context.object)
g.append(frustum("g", 0.62, 0.62, 0.5, 0.5, 1.0, 1.08, 1.03, STEEL))        # a cap over the top
g[-1].location = B(-0.38, 0, -0.38)
bpy.ops.object.select_all(action="DESELECT")
g[-1].select_set(True)
bpy.context.view_layer.objects.active = g[-1]
bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
join("slab_guard", g, STEEL)

# ---- the pancake: a wide flat lid ----
lid = [frustum("p", 0.52, 0.51, 0.47, 0.46, 0.0, 0.12, 0.05, PLATE),
       frustum("p", 0.2, 0.25, 0.18, 0.23, 0.12, 0.16, 0.14, PLATE)]          # an access panel
join("pancake_lid", lid, PLATE)
bl = []
for i in range(5):
    x = -0.4 + i * 0.2
    bl += [bolt(0.018, 0.05, x, 0.12, -0.43), bolt(0.018, 0.05, x, 0.12, 0.43)]
for z in (-0.2, 0, 0.2):
    bl += [bolt(0.018, 0.05, -0.44, 0.12, z), bolt(0.018, 0.05, 0.44, 0.12, z)]
for x, z in ((-0.16, -0.21), (0.16, -0.21), (-0.16, 0.21), (0.16, 0.21)):
    bl.append(bolt(0.014, 0.04, x, 0.16, z))
join("pancake_bolts", bl, STEEL)

# ---- the invertible: one plate, the game mirrors it underneath ----
pl = [frustum("i", 0.49, 0.49, 0.44, 0.44, 0.0, 0.09, 0.04, PLATE)]
for x in (-0.22, 0.22):                                                       # two raised rails, so either side up it skids
    pl.append(prism_z("i", [(x - 0.04, 0.09), (x + 0.04, 0.09), (x + 0.03, 0.14), (x - 0.03, 0.14)], -0.38, 0.38, PLATE))
join("invert_plate", pl, PLATE)
bl = [bolt(0.02, 0.05, x, 0.09, z) for x in (-0.38, 0.38) for z in (-0.38, 0, 0.38)]
join("invert_bolts", bl, STEEL)

# ---- the scrap frame: a tube and a weld ----
bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=1, depth=1, location=(0, 0, 0))
t = bpy.context.object                                                        # Blender's z is three's y: along y, as CylinderGeometry
for p in t.data.polygons:
    p.use_smooth = True
t.name = t.data.name = "scrap_tube"
t.data.materials.append(STEEL)
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1, location=(0, 0, 0))
w = bpy.context.object
rnd = random.Random(1982)
for v in w.data.vertices:
    v.co *= rnd.uniform(0.82, 1.12)
w.name = w.data.name = "scrap_weld"
w.data.materials.append(STEEL)

bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLTF_SEPARATE", export_apply=True, export_yup=True,
                          export_normals=True, export_materials="EXPORT", use_selection=False)
print("wrote", OUT)

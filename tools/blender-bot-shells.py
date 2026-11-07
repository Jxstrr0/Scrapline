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
  pancake_lid   a wide flat lid (y 0..0.12) with chamfered edges and two side hatches; pancake_bolts
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


def wedge_parts(solid=False):
    top = [prism_x("w", [(0.5, 0), (-0.5, -0.6), (-0.47, -0.6 + T), (0.5, T)], -0.49, 0.49, PLATE)]
    for zc in (0.12, -0.16):                  # two stiffening ribs across the slope, parted in the middle for the team stripe
        a, b = zc - 0.035, zc + 0.035
        for x0, x1 in ((-0.42, -0.18), (0.18, 0.42)):
            top.append(prism_x("w", [(b, slope(b) + T), (a, slope(a) + T), (a, slope(a) + T + 0.06), (b, slope(b) + T + 0.06)], x0, x1, PLATE))
    top.append(prism_x("w", [(0.5, T), (0.44, T), (0.44, T + 0.05), (0.5, T + 0.05)], -0.49, 0.49, PLATE))   # a hinge strip at the back
    return top


# bolt heads as (r, h, x, y, z) for bolt(): kept as lists so the bay variants can leave some out
WEDGE_BOLTS = [(0.02, 0.05, x, slope(zc) + T, zc) for x in (-0.43, 0.43) for zc in (0.38, 0.05, -0.28)]
WEDGE_BOLTS += [(0.018, 0.05, x, T + 0.05, 0.47) for x in (-0.25, 0, 0.25)]   # on the hinge strip, behind the sponsor patch
join("wedge_top", wedge_parts(), PLATE)
join("wedge_bolts", [bolt(*a) for a in WEDGE_BOLTS], STEEL)
for s, nm in ((-1, "wedge_cheek_l"), (1, "wedge_cheek_r")):
    x0, x1 = (-0.5, -0.47) if s < 0 else (0.47, 0.5)
    c = prism_x(nm, [(0.5, -0.6), (0.5, 0.0), (-0.5, -0.6)], x0, x1, PLATE)
    lip = prism_x("c", [(0.5, -0.66), (0.5, -0.6), (-0.5, -0.6), (-0.5, -0.66)], x0 - s * 0.005, x1 + s * 0.005, PLATE)
    join(nm, [c, lip], PLATE)

# ---- the dome: a half ellipsoid over the box, y -0.3..0.5, a rim flange ----
def dome_parts(solid=False):
    """solid (for the bay variants): tag the half ellipsoid as an open, one-sided surface, so the cut treats it so"""
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
    if solid:
        d["open"] = 1
    rim = []
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=1, depth=1, location=B(0, -0.33, 0))
    r = bpy.context.object
    r.scale = (0.545, 0.53, 0.07)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    rim.append(r)
    ridge = prism_z("r", [(-0.03, 0), (0.03, 0), (0.02, 0.04), (-0.02, 0.04)], -0.42, 0.42, PLATE)   # a seam along the crown
    for v in ridge.data.vertices:      # bend it onto the dome's surface (Blender z is three's y, y is -three's z)
        zz = -v.co.y
        k = max(0.0, 1 - (zz / 0.51) ** 2)
        v.co.z += -0.3 + 0.8 * math.sqrt(k) - 0.01
    rim.append(ridge)
    return [d] + rim


DOME_BOLTS = [(0.02, 0.05, math.cos(a) * 0.525, -0.3 + 0.03, math.sin(a) * 0.515) for a in (i * 2 * math.pi / 14 for i in range(14))]
join("dome_shell", dome_parts(), PLATE)
join("dome_bolts", [bolt(*a) for a in DOME_BOLTS], STEEL)

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
def pancake_parts(solid=False):
    lid = [frustum("p", 0.52, 0.51, 0.47, 0.46, 0.0, 0.12, 0.05, PLATE)]
    for x in (-0.33, 0.33):                                                   # two access hatches, clear of the stripe and the patch
        h = frustum("p", 0.06, 0.15, 0.05, 0.14, 0.12, 0.16, 0.14, PLATE)
        for v in h.data.vertices:
            v.co.x += x
        lid.append(h)
    return lid


PANCAKE_BOLTS = []
for i in range(5):
    x = -0.4 + i * 0.2
    PANCAKE_BOLTS += [(0.018, 0.05, x, 0.12, -0.43)] + ([] if abs(x) < 0.35 else [(0.018, 0.05, x, 0.12, 0.43)])   # the back middle is the sponsor patch's
for z in (-0.2, 0, 0.2):
    PANCAKE_BOLTS += [(0.018, 0.05, -0.44, 0.12, z), (0.018, 0.05, 0.44, 0.12, z)]
PANCAKE_BOLTS += [(0.012, 0.04, x, 0.16, z) for x in (-0.33, 0.33) for z in (-0.11, 0.11)]
join("pancake_lid", pancake_parts(), PLATE)
join("pancake_bolts", [bolt(*a) for a in PANCAKE_BOLTS], STEEL)

# ---- the invertible: one plate, the game mirrors it underneath ----
def invert_parts(solid=False):
    pl = [frustum("i", 0.49, 0.49, 0.44, 0.44, 0.0, 0.09, 0.04, PLATE)]
    for x in (-0.22, 0.22):                                                   # two raised rails, so either side up it skids
        pl.append(prism_z("i", [(x - 0.04, 0.09), (x + 0.04, 0.09), (x + 0.03, 0.14), (x - 0.03, 0.14)], -0.38, 0.38, PLATE))
    return pl


INVERT_BOLTS = [(0.02, 0.05, x, 0.09, z) for x in (-0.38, 0.38) for z in (-0.38, 0, 0.38)]
join("invert_plate", invert_parts(), PLATE)
join("invert_bolts", [bolt(*a) for a in INVERT_BOLTS], STEEL)

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

# ---- weapon bays: slotted variants of the four top shells and their bolts ----
OPENINGS = {   # variant: (kind, set A, set B); rect (x0, z0, x1, z1), ellipse (cx, cz, rx, rz); every one is open at the front
    "slot":   ("rect", (-0.058, -0.5, 0.058, -0.139), (-0.058, -0.5, 0.058, -0.194)),
    "pocket": ("rect", (-0.267, -0.5, 0.267, -0.289), (-0.267, -0.5, 0.267, -0.317)),
    "well":   ("ell", (0, -0.333, 0.442, 0.294), (0, -0.389, 0.442, 0.294)),
    "hammer": ("rect", (-0.25, -0.5, 0.25, 0.187), (-0.167, -0.5, 0.167, 0.187)),
    "flip":   ("rect", (-0.47, -0.5, 0.47, 0.08), (-0.47, -0.5, 0.47, 0.08)),
    "lift":   ("rect", (-0.25, -0.5, 0.25, -0.167), (-0.167, -0.5, 0.167, -0.278)),
    "crush":  ("rect", (-0.25, -0.5, 0.25, 0.0), (-0.167, -0.5, 0.167, -0.167)),
    "under":  ("ell", (0, -0.417, 0.353, 0.236), (0, -0.444, 0.353, 0.236)),
}
SHELLS = [   # shell, its parts, its floor (the box top under it), its bolts and their specs, which variants
    ("wedge_top", wedge_parts, -0.6, "wedge_bolts", WEDGE_BOLTS),
    ("dome_shell", dome_parts, 0.0, "dome_bolts", DOME_BOLTS),
    ("pancake_lid", pancake_parts, 0.0, "pancake_bolts", PANCAKE_BOLTS),
    ("invert_plate", invert_parts, 0.0, "invert_bolts", INVERT_BOLTS),
]
LIP_W, LIP_B = 0.012, 0.003    # the lip's width and its bevel, in lengths on a REF body (offsets are divided by REF)
LIP_H, LIP_BV = 0.02, 0.008    # how proud it stands and its bevel's drop, in chassis heights
ELL_N = 28                     # sides of an elliptical opening (the cutter and the sleeve share them, so they meet exactly)


class Opening:
    def __init__(self, kind, p):
        self.kind, self.p = kind, p
        if kind == "rect":
            x0, z0, x1, z1 = p
            self.poly = [(x0, -0.9), (x0, z1), (x1, z1), (x1, -0.9)]
            self.path = [(x0, -0.6), (x0, z1), (x1, z1), (x1, -0.6)]   # the edge round the opening, front to front
        else:
            cx, cz, rx, rz = p
            self.poly = [(cx + rx * math.sin(t), cz + rz * math.cos(t)) for t in (-math.pi + 2 * math.pi * k / ELL_N for k in range(ELL_N))]
            self.path = self.poly + [self.poly[0]]                       # starts and ends at the front point, off the body

    def inside(self, x, z):
        c, n = False, len(self.poly)
        for i in range(n):
            (ax, az), (bx, bz) = self.poly[i], self.poly[(i + 1) % n]
            if (az > z) != (bz > z) and x < ax + (z - az) * (bx - ax) / (bz - az):
                c = not c
        return c

    def grown(self, x, z, g):
        """inside the opening grown by g (for the bolts)"""
        if self.kind == "rect":
            x0, z0, x1, z1 = self.p
            return x0 - g <= x <= x1 + g and z <= z1 + g
        cx, cz, rx, rz = self.p
        return ((x - cx) / (rx + g)) ** 2 + ((z - cz) / (rz + g)) ** 2 <= 1

    def edge_dist(self, x, z):
        best, n = 9.0, len(self.poly)
        for i in range(n):
            (ax, az), (bx, bz) = self.poly[i], self.poly[(i + 1) % n]
            dx, dz = bx - ax, bz - az
            t = max(0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)))
            best = min(best, math.hypot(x - ax - t * dx, z - az - t * dz))
        return best


def cutter_obj(op):
    n = len(op.poly)
    v = [(x, -3.0, z) for x, z in op.poly] + [(x, 3.0, z) for x, z in op.poly]
    f = [list(range(n)), list(range(2 * n - 1, n - 1, -1))] + [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
    o = mesh_obj("cutter", v, f, PLATE)
    recalc(o)
    return o


def remove(o):
    me = o.data
    bpy.data.objects.remove(o)
    if me.users == 0:
        bpy.data.meshes.remove(me)


def bisect_y(o, y):
    """split a part's faces at height y, so the faces a bay cuts lie wholly above or below the floor"""
    zs = [v.co.z for v in o.data.vertices]
    if not (min(zs) < y - 1e-4 and max(zs) > y + 1e-4):
        return
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-6, plane_co=(0, 0, y), plane_no=(0, 0, 1))
    bm.to_mesh(o.data)
    bm.free()


def boolean_cut(o, cutter):
    m = o.modifiers.new("bay", "BOOLEAN")
    m.operation, m.solver, m.object = "DIFFERENCE", "EXACT", cutter
    m.use_hole_tolerant = bool(o.get("open"))
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=m.name)
    if not o.data.polygons:
        remove(o)
        return None
    return o


def height_fn(o):
    """the shell's top surface: y at (x, z) seen from above, or None off the piece"""
    from mathutils.bvhtree import BVHTree
    me = o.data
    tree = BVHTree.FromPolygons([v.co[:] for v in me.vertices], [p.vertices[:] for p in me.polygons])

    def H(x, z):
        hit = tree.ray_cast(B(x, 5.0, z), (0.0, 0.0, -1.0))
        return None if hit[0] is None else hit[0].z
    return H


def sleeve(op, H, floor):
    """the sleeve wall (the opening's edge from the shell's surface down to the floor) and the lip round it, as one strip
    along the opening's edge; returns (verts, faces) in three.js space"""
    path = op.path
    rx, rz = REF[0], REF[2]
    # outward normals (away from the opening) per edge segment, worked out on a REF body so the lip is as wide everywhere
    segn = []
    for i in range(len(path) - 1):
        (ax, az), (bx, bz) = path[i], path[i + 1]
        dx, dz = (bx - ax) * rx, (bz - az) * rz
        L = math.hypot(dx, dz)
        nx, nz = dz / L, -dx / L
        mx, mz = (ax + bx) / 2, (az + bz) / 2
        if op.inside(mx + 1e-3 * nx / rx, mz + 1e-3 * nz / rz):
            nx, nz = -nx, -nz
        segn.append((nx, nz))

    def miter(i):                                          # at path point i
        if i == 0:
            return segn[0]
        if i == len(path) - 1:
            return segn[-1]
        (ax, az), (bx, bz) = segn[i - 1], segn[i]
        mx, mz = ax + bx, az + bz
        k = mx * ax + mz * az
        return (mx / k, mz / k)

    def sample(x, z, n):
        h0 = H(x, z)
        rec = {"x": x, "z": z, "n": n, "ok": h0 is not None and h0 > floor + 1e-3}
        if rec["ok"]:
            hs = []
            for o in (LIP_B, LIP_W - LIP_B, LIP_W):
                h = H(x + o * n[0] / rx, z + o * n[1] / rz)
                h = h0 if h is None else h0 + max(-2.5 * o, min(2.5 * o, h - h0))   # a step beside the edge is ramped, not followed
                hs.append(h)
            rec["h"] = [h0] + hs
        return rec

    S = []
    for i in range(len(path) - 1):
        (ax, az), (bx, bz) = path[i], path[i + 1]
        n = segn[i]
        L = math.hypot((bx - ax) * rx, (bz - az) * rz)
        k = max(1, math.ceil(L / 0.03))
        ts = [j / k for j in range(k + 1)]
        P = lambda t: (ax + (bx - ax) * t, az + (bz - az) * t)
        recs = [sample(*P(t), n) for t in ts]
        recs[0]["n"] = miter(i)
        recs[-1]["n"] = miter(i + 1)
        recs[0] = sample(recs[0]["x"], recs[0]["z"], recs[0]["n"])
        recs[-1] = sample(recs[-1]["x"], recs[-1]["z"], recs[-1]["n"])
        recs[0]["v"] = recs[-1]["v"] = True                # a corner of the path: always kept
        out = [(0.0, recs[0])]

        def refine(t0, r0, t1, r1):
            tm = (t0 + t1) / 2
            rm = sample(*P(tm), n)
            if (t1 - t0) * L > (2e-5 if r0["ok"] != r1["ok"] else 1e-3) and (r0["ok"] != r1["ok"] or (r0["ok"] and r1["ok"] and (not rm["ok"] or abs(rm["h"][0] - (r0["h"][0] + r1["h"][0]) / 2) > 0.004))):
                refine(t0, r0, tm, rm)
                out.append((tm, rm))
                refine(tm, rm, t1, r1)
        for j in range(len(ts) - 1):
            refine(ts[j], recs[j], ts[j + 1], recs[j + 1])
            out.append((ts[j + 1], recs[j + 1]))
        if S:
            out = out[1:]                                  # the shared corner is already in
            S[-1] = recs[0]
        S += [r for _, r in out]

    # thin each straight stretch of edge (Douglas-Peucker on the edge's height): a flat run keeps only its ends, a curved one
    # (the dome) a sample wherever the straight line between kept samples would be off by more than 0.003 chassis heights
    n = len(S)
    keep = [True] * n
    for i in range(1, n - 1):
        a, m, b = S[i - 1], S[i], S[i + 1]
        keep[i] = m.get("v", False) or not (a["ok"] and m["ok"] and b["ok"])

    def dp(i, j):
        if j - i < 2:
            return
        ax, az, bx, bz = S[i]["x"], S[i]["z"], S[j]["x"], S[j]["z"]
        L = math.hypot(bx - ax, bz - az) or 1.0
        worst, wk = 0.0, -1
        for k in range(i + 1, j):
            t = math.hypot(S[k]["x"] - ax, S[k]["z"] - az) / L
            e = abs(S[i]["h"][0] + (S[j]["h"][0] - S[i]["h"][0]) * t - S[k]["h"][0])
            if e > worst:
                worst, wk = e, k
        if worst > 0.003:
            keep[wk] = True
            dp(i, wk)
            dp(wk, j)
    i = 0
    while i < n - 1:
        j = i + 1
        while not keep[j]:
            j += 1
        dp(i, j)
        i = j
    S = [r for r, k in zip(S, keep) if k]

    verts, faces = [], []

    def section(r):
        x, z, (nx, nz), (h0, hb, hwb, hw) = r["x"], r["z"], r["n"], r["h"]
        pt = lambda o, y: (x + o * nx / rx, y, z + o * nz / rz)
        base = len(verts)
        # a closed profile: the wall up from under the floor, the lip's bevel, top and bevel, its outer face back down (inside
        # the shell, so a lip end that overhangs a shell's edge still shows no open back), and a bottom under the floor
        verts.extend([pt(0, floor - 0.01), pt(0, h0 + LIP_H - LIP_BV), pt(LIP_B, hb + LIP_H), pt(LIP_W - LIP_B, hwb + LIP_H),
                      pt(LIP_W, hw + LIP_H - LIP_BV), pt(LIP_W, floor - 0.01)])
        return base

    def newell(ids):
        nx = ny = nz = 0.0
        for a, b in zip(ids, ids[1:] + ids[:1]):
            (x1, y1, z1), (x2, y2, z2) = verts[a], verts[b]
            nx += (y1 - y2) * (z1 + z2)
            ny += (z1 - z2) * (x1 + x2)
            nz += (x1 - x2) * (y1 + y2)
        return nx, ny, nz

    def face(ids, want):                                   # a face turned to face the direction want
        n = newell(ids)
        faces.append(ids if n[0] * want[0] + n[1] * want[1] + n[2] * want[2] >= 0 else ids[::-1])

    sharp = set()

    def crease(b):                                         # the whole profile at one sample
        for k in range(6):
            sharp.add(tuple(sorted((b + k, b + (k + 1) % 6))))

    def turn(a, b):                                        # a corner or a step between samples a and b
        if a["n"][0] * b["n"][0] + a["n"][1] * b["n"][1] < 0.9:
            return True
        L = math.hypot((b["x"] - a["x"]) * rx, (b["z"] - a["z"]) * rz)
        return max(abs(a["h"][q] - b["h"][q]) for q in range(4)) * REF[1] > 0.6 * L

    prev = None
    for i, r in enumerate(S):
        if not r["ok"]:
            if prev is not None:                           # a run ends: cap it
                pr = S[i - 1]
                face([prev + k for k in range(6)], (pr["x"] - S[i - 2]["x"] if i > 1 else 0, 0, pr["z"] - S[i - 2]["z"] if i > 1 else 0))
                crease(prev)
            prev = None
            continue
        b = section(r)
        if prev is None:                                   # a run starts: cap it, facing back along the edge
            nxt = S[i + 1] if i + 1 < len(S) else r
            face([b + k for k in range(6)], (r["x"] - nxt["x"], 0, r["z"] - nxt["z"]))
            crease(b)
        else:
            pr = S[i - 1]
            d = (r["x"] - pr["x"], r["z"] - pr["z"])
            nx, nz = pr["n"]
            wants = [(-nx, 0, -nz), (-nx, 1, -nz), (0, 1, 0), (nx, 1, nz), (nx, 0, nz), (0, -1, 0)]   # wall, bevel, top, bevel, outer, bottom
            for k in range(6):
                k1 = (k + 1) % 6
                face([prev + k, b + k, b + k1, prev + k1], wants[k])
            sharp.add((prev, b))                           # the wall's foot
            sharp.add((prev + 1, b + 1))                   # the wall meets the lip; the lip's bevels and top shade as one rounded edge
            if turn(pr, r):
                crease(prev)
                crease(b)
        prev = b
    if prev is not None:
        pr, pp = S[-1], S[-2]
        face([prev + k for k in range(6)], (pr["x"] - pp["x"], 0, pr["z"] - pp["z"]))
        crease(prev)
    return verts, faces, sharp


def shell_variant(name, parts_fn, floor, op, H):
    cut = cutter_obj(op)
    parts = []
    for prt in parts_fn(solid=True):
        bisect_y(prt, floor)
        opened = bool(prt.get("open"))
        prt = boolean_cut(prt, cut)
        if not prt:
            continue
        # the faces the cutter left on the opening's sides: above the floor the sleeve wall stands there instead (an open
        # surface has no inside, so whatever the cutter left on it goes)
        bm = bmesh.new()
        bm.from_mesh(prt.data)
        dead = []
        for f in bm.faces:
            c = f.calc_center_median()
            if abs(f.normal.z) < 0.05 and (opened or all(v.co.z >= floor - 1e-4 for v in f.verts)) and op.edge_dist(c.x, -c.y) < 2e-4:
                dead.append(f)
        bmesh.ops.delete(bm, geom=dead, context="FACES")
        bm.to_mesh(prt.data)
        bm.free()
        parts.append(prt)
    remove(cut)
    o = join(name, parts, PLATE)
    v, f, sharp = sleeve(op, H, floor)
    if f:
        w = mesh_obj("sleeve", v, f, PLATE)
        for p in w.data.polygons:      # smooth along the edge, creased across the profile, at corners and at steps
            p.use_smooth = True
        for e in w.data.edges:
            if tuple(sorted(e.vertices)) in sharp:
                e.use_edge_sharp = True
        o = join(name, [o, w], PLATE)
    return o


made = {}                                                   # identical openings share one mesh
for shell, parts_fn, floor, bolts, specs in SHELLS:
    H = height_fn(bpy.data.objects[shell])
    plain_bolts = bpy.data.objects[bolts]
    for var, (kind, pa, pb) in OPENINGS.items():
        if var == "under" and shell != "invert_plate":
            continue
        for setn, p in (("A", pa), ("B", pb)):
            op = Opening(kind, p)
            key = (shell, kind, p)
            nm = "%s__%s_%s" % (shell, var, setn)
            if key in made:
                o = bpy.data.objects.new(nm, made[key])
                SC.collection.objects.link(o)
            else:
                o = shell_variant(nm, parts_fn, floor, op, H)
                made[key] = o.data
            keep = tuple(i for i, a in enumerate(specs) if not op.grown(a[2], a[4], 0.03))
            nm = "%s__%s_%s" % (bolts, var, setn)
            key = (bolts, keep)
            if len(keep) == len(specs):
                made[key] = plain_bolts.data
            if key not in made:
                made[key] = join(nm, [bolt(*specs[i]) for i in keep], STEEL).data if keep else None
            if made[key] is None:
                print("no bolts left on", nm)
                continue
            if nm not in bpy.data.objects:
                o = bpy.data.objects.new(nm, made[key])
                SC.collection.objects.link(o)

bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLTF_SEPARATE", export_apply=True, export_yup=True,
                          export_normals=True, export_materials="EXPORT", use_selection=False)
print("wrote", OUT)

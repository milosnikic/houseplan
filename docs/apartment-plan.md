# Apartment plan: combined decisions

This file is the single source of truth for the apartment design. It combines the owner's decisions, Nadja's notes and the layout work done in the planner. It is written to be handed to an agent as context.

How to read it:

- Every statement carries a status: **Decided** (agreed by the owners), **Proposed** (recommended, not yet confirmed) or **Open** (unknown or undecided).
- All sizes are in cm unless a unit is given. Room sizes come from a plan rounded to 5 cm and must be confirmed on site before anything fitted is ordered.
- Exact furniture positions live in `tools/make-layouts.js`, not here. Run `node tools/make-layouts.js` to rebuild `layouts/*.json`, then load a file in the planner with Import JSON. The base layout is `layouts/living-B-tv-on-left-wall.json`.
- Do not present a Proposed or Open item as settled.

## 1. Household and goals

- Two adults (176 cm and 167 cm tall) and Toto, a 7.5 kg bichon.
- Both work from home. Calls are taken on laptops in separate rooms.
- Guests: 2 to 6 for dinner, irregular. Overnight guests sleep on the sofa.
- Nadja usually eats at the sofa, so the dining table is secondary.
- They own motorcycle gear: two helmets and bulky jackets.
- The gaming room may become a nursery later. Furniture there stays freestanding.
- They may restyle later (minimal, industrial, retro), so expensive fixed surfaces stay neutral.

## 2. The apartment as measured

Inner dimensions, origin of each room at its top-left inner corner with the plan's entrance on the left.

| Room | Size | Fixed features |
|---|---|---|
| Living and dining | 450 x 500 | Left wall solid. Top wall is the bedroom partition, bedroom door at its left end. Right wall: 70 solid, 240 terrace glazing, 190 solid pier. Bottom: corridor opening 105 wide at the left, kitchen recess to the right |
| Kitchen recess | 315 x 60 | Opens to the living room. Ends about 19 short of the right wall line |
| Upper bedroom | 450 x 290 | 430 wide at the head wall because of a shaft in the top-right corner. Wardrobe niche 60 x 175 top-left. Door bottom-left. Window on the right wall, about 150 wide |
| Lower bedroom (gaming room) | 335 x 290 | Door on the left wall near the top. Wardrobe niche 60 x 174 on the left wall below it. Window on the right wall, about 90 wide |
| Bathroom | 255 x 160 | Delivered finished, shower, underfloor heating |
| WC | 130 x 160 | Delivered finished, underfloor heating |
| Laundry closet | 132 x 67 | Folding doors to the corridor |
| Entrance | 2.7 m2 | Front door opens inward. Cupboard recess about 110 x 67 |
| Corridor | 105 wide | |
| Terrace | 145 x 370 | Reached through the living room glazing |

**Open:** ceiling height, radiator positions (heating is probably radiators), which glazing panel opens (believed sliding), parquet tone (developer-supplied).

## 3. Rules the layout follows

Clearances:

| Where | Clearance |
|---|---|
| Main walking route | 80 to 90, 60 minimum for a secondary one |
| In front of kitchen counter | 100 to 120 |
| Behind a dining chair | 75 to 90, 60 if nobody passes |
| Sofa to coffee table | 40 to 45 |
| Beside a bed | 60 to 70, 50 minimum |
| In front of a hinged wardrobe | 90 |
| In front of a toilet | 60, with 20 free on each side |

Other rules:

- Screens sit at a right angle to windows where the room allows it.
- Seats and the bed should see the door without being in line with it (command position). Results are listed per room.
- Tall furniture stays away from glazing.
- Storage target is 250 to 300 cm of wardrobe length for two people.

## 4. Living room: layout B (Decided as the base)

The TV is on the left wall and the L-shaped sofa faces it with its back to the terrace.

- TV unit 180 x 40 on the left wall, with a 65 inch TV (145 wide) mounted above it. Screen centre 100 to 110 above the floor.
- Two speakers on stands flank the unit, 25 off the wall. They need their own sockets. The group starts 73 below the bedroom door wall so the doorway stays clear.
- L-shaped fold-out sofa, at most 250 x 160. Seen from the sofa while facing the TV, the return is on the right, at the bedroom end. Olive fabric in a tight weave with removable covers.
- Coffee table about 90 x 56, light or on wheels so it moves for the fold-out bed.
- Round extendable dining table, 100 to 110 across, opening to about 155 for six. Three chairs stay out.
- Toto's second bed in the top-right corner behind the sofa.

Clearances in this layout: 90 between TV unit and coffee table (the route to the bedroom), 130 behind the sofa to the glazing, 94 from table to kitchen counter, 84 from table to the kitchen leg.

Accepted costs:

- The route from the corridor to the bedroom passes in front of the screen.
- The TV faces the glazing, so daytime viewing needs the sheer curtain closed.
- Chairs on the kitchen side of the table are pushed in while someone cooks.

Command position: passes. Both doors are in view from every sofa seat.

**Proposed:** a 30 deep TV unit in place of the 40 one, which widens the route to 100.
**Proposed:** prints on the top wall above the sofa return. The left wall below the TV group stays free of furniture.
**Rejected alternative:** layout A (`layouts/living-A-tv-on-bedroom-wall.json`), TV on the bedroom partition. It keeps the route clear but leaves the corridor entrance behind the main seats.

## 5. Kitchen (Decided unless marked)

An L shape: the recess plus a leg along the right wall toward the terrace.

| Recess, from the corridor side | Width |
|---|---|
| Fridge-freezer, integrated tall unit | 60 |
| Oven and microwave, tall unit | 60 |
| Dishwasher | 60 |
| Sink base | 80 |
| Corner unit | 55 |

| Leg, from the corner toward the terrace | Width |
|---|---|
| Drawers, main prep worktop | 60 |
| Hob unit with a 2-zone induction hob | 60 |
| Drawers, small appliances | 45 |

- The leg is 60 deep and stops 25 before the glazing, for the curtain and to keep fabric away from the hob.
- Worktop height 92. Oven base at 70, microwave base at 130.
- Hob: 30 wide domino with a bridge zone, one 16 A circuit.
- Sink: single bowl, undermount or flush, 90 mm outlet. Waste grinder, drinking-water filter and a pull-out spray tap share the 80 base. Bins get their own pull-out.
- Worktop: light quartz or sintered stone, because the undermount sink rules out laminate and wood.
- Air fryer and toaster live on the leg's end section, with no wall cabinet above and a deep pull-out below.
- Wall cabinets on the leg only above the hob. Hood on the right wall, recirculating or ducted.
- Fronts: wood on base units, warm off-white on tall and wall units, flat fronts with screw-on handles, cabinet bodies in standard module sizes.
- Toto's bowls: an open floor-level niche in the last leg unit (**Proposed**).

**Open:** whether a radiator sits on the 190 pier wall (it would have to move), whether the building allows a waste grinder, fridge ice maker by water line or tank, exact recess width.

Command position: fails. It cannot be fixed with a wall kitchen.

## 6. Bedroom (Decided unless marked)

- Bed 180 x 200, frame about 190 x 210, headboard on the top wall, centred between the wardrobe front and the shaft.
- Clearances: 90 on the wardrobe side, 90 on the window side (70 once curtains hang), 80 at the foot.
- Wardrobe in the niche, 60 x 174, with sliding mirrored doors. Hinged doors would hit the nightstand.
- Nightstand 40 x 40 on the wardrobe side.
- Vanity (make-up table) as the window-side nightstand: floating top about 86 x 40 with a mirror (**Proposed**, owners said probably yes).
- Wall-mounted reading lamps on both sides, so both bedsides need wiring points.
- TV about 110 wide on the partition opposite the bed. The partition needs reinforcement at the mount.
- Toto's bed 60 x 50 in the window-side corner at the foot.
- Storage: a lift-up storage bed for bedding and off-season items. Bags in upright wardrobe cubbies.
- Look: oak slat panel behind the headboard with an LED wash from the top, olive bedding.

Command position: passes.

## 7. Gaming and office room (Decided)

- Desk 160 x 80 (existing) on the top wall, starting 95 from the door wall.
- Desk 120 x 70 (existing) in the bottom corner on the window side.
- Three monitors in total and both PC towers on the desks.
- The two sit back to back with 140 between the desks. The chairs are offset by 100.
- Wardrobe in the niche, 60 x 174, with 155 free in front.
- Glass display cabinet for Funko figures (35 x 32 x 151) at the window end of the top wall.
- Nothing stands under the window.
- Blackout roller blind inside the window opening, an AC unit, cable trays under the desks, an RGB neon strip above the monitors, a deeper green on the walls.
- Each desk needs 6 to 8 sockets and a wired network point.

Command position: the top desk has the door in side view. The bottom desk has it over a shoulder. Accepted as the one exception.

## 8. Entrance, laundry, bathrooms, terrace

Entrance (Decided unless marked):

- Closed cupboard in the recess, about 110 x 60: full hanging depth for motorcycle jackets, one shelf per helmet (about 40 deep and 30 high, measure the helmets), daily shoes below, a tray for gloves, a hook for Toto's lead and a towel.
- Slim shoe cabinet (52 x 18 x 39) only where it clears the doors.
- Mirror with an organic outline, not directly facing the front door.
- **Open:** where a bench fits. The corridor is 105 wide.

Laundry closet (Decided):

- Washer and dryer stacked on the left, with a pull-out shelf between them.
- Tall shelf unit, about 65 wide, on the right: hampers at the bottom, towels in the middle, chemicals behind a latch at the top.
- Vacuum dock on the side wall with its own socket.
- Louvred folding doors for dryer air.
- **Open:** whether the 67 depth takes the machines plus hoses.

Bathroom and WC (delivered finished):

- Add a mirror cabinet, a divided drawer for hair tools, a low holder for the hand shower and a hair trap for washing Toto.
- Shallow cabinet, 15 deep, above the WC cistern for paper and hand towels.
- **Open:** whether an extractor fan with a humidity sensor is delivered, and whether both doors clear the fixtures.

Terrace (**Proposed**, not yet discussed in detail):

- Two lounge chairs of about 70 x 70 and a small round side table, an outdoor rug, wall lights, plants.
- A shaded mat and water for Toto.
- **Open:** railing gaps and threshold height for the dog, and whether the terrace has a light point and a socket.

## 9. Style and materials

- Mood from the owners' reference images: warm wood, cream and olive in warm, dim light. Bright colours are absent.
- Palette: warm white walls, one light oak tone matched to the delivered parquet, olive as the main colour, cream textiles. Terracotta and ochre only as small accents.
- Gaming room: deeper green and the strongest coloured light.
- Signature elements: oak slat panels (TV wall, headboard, entrance), hidden LED strips, rounded shapes, an organic mirror, wooden speakers, flat-woven rugs.
- TV wall: a stone-look centre panel with slat panels on both sides. It must stay shallow because the route passes it.
- Plants near the glazing, dog-safe only. Safe: areca and parlor palms, calathea, pilea, spider plant, Boston fern. Toxic to dogs: monstera, pothos, ficus, snake plant.
- Keep neutral (hard to change): floor, worktop, backsplash, cabinet bodies, appliances. Make expressive (easy to change): fronts, handles, paint, textiles, lamps.

## 10. Curtains (Decided)

- Living room and bedroom: two ceiling tracks wall to wall, sheer nearest the glass and blackout on the room side, floor to ceiling, overlapping the wall by 20 on each side.
- The pair needs a strip 20 deep in front of the window wall that stays free of furniture.
- Living room curtains stack to about 70 when open, on the 70 wall at the bedroom end.
- Not motorized. A power feed at each track end is still wanted so motors can be added.
- **Open:** a recessed ceiling pocket for the tracks depends on the ceiling height.

## 11. Lighting, power and smart home

Lighting:

- Three layers per room, each switched separately: general, task, accent. Dimmers on general light in the living room and bedroom.
- 2700 to 3000 K where people relax, 4000 K only for task light at the worktop and desks, CRI 90 or higher.
- Switches on the handle side of each door at 105 to 110. Two-way switching at both bedsides and at both ends of the living room route.
- LED strip locations: TV wall, headboard, entrance, kitchen under-cabinet, laundry shelves, gaming room. Each needs an always-on feed and a ventilated place for its power supply.

Sockets and data:

| Place | Points |
|---|---|
| Kitchen, dedicated | fridge, dishwasher, oven, microwave, hob, hood, grinder |
| Kitchen worktop | 4 to 6 above the counter, including the small-appliance section |
| Each desk | 6 to 8 plus network |
| TV wall (left wall) | 6 plus network and a cable conduit, some behind the screen, plus one per speaker |
| Sofa | 2 at each end |
| Bedsides | 2 per side, a switch and a wall-lamp point |
| Table | 1 to 2 for laptops |
| Laundry | washer, dryer, vacuum dock |
| Elsewhere | a low socket for a robot vacuum dock, a network cable to a central ceiling point for Wi-Fi |

Smart home (Decided direction):

- Home Assistant runs the home. Philips Hue and Govee are the preferred light brands, and the owner will add his own LED strips.
- Each lighting circuit is one of two kinds, never both. Smart lamp: power always on and the wall button only sends a command. Smart switch: an ordinary lamp with a smart module behind the switch.
- Hue for main lights and white strips. Govee, in models with Matter or local control, for effects in the gaming room and behind the TV.
- A first draft of sockets, switches, lights, LED strips and network points is drawn on the Electrical layer of layout B (**Proposed**, positions are approximate). Export PNG gives the drawing with a count of each symbol.
- The building is described as smart ready, with the control unit bought later. **Open:** which system that is, what it controls, whether every switch box is deep and has a neutral wire, and where the network cabinet is.

## 12. Storage summary

| Place | Length or size |
|---|---|
| Bedroom niche wardrobe | 174 |
| Gaming room niche wardrobe | 174 |
| Entrance cupboard | about 110 |
| Storage bed | under a 180 x 200 mattress |
| Laundry shelf unit | 65 wide, full height |

## 13. To confirm with the developer or on site

- A dimensioned drawing, delivered fixtures and appliance connections.
- Ceiling height.
- Radiator positions, above all on the 190 wall beside the kitchen recess.
- Which terrace panel opens, and what the terrace is delivered with.
- The electrical plan and the last date for buyer changes.
- What "smart ready" includes (see section 11).
- Reinforcement in the bedroom partition for the TV mount.
- Whether a waste grinder is allowed on the building's drains.
- Laundry closet depth, sockets, water and drain positions.
- Bring a tape measure, painter's tape and the sizes of desks, chairs, speakers, TV, dog beds, helmets and shoe boxes. Tape out each footprint and walk it with doors and chairs in use.

## 14. Shopping shortlist so far

- L-shaped fold-out sofa, at most 250 x 160, return on the right when seated.
- Round extendable table, 100 to 110, opening to about 155.
- IKEA BESTA TV unit 180 x 40 x 38, or a 30 deep alternative.
- IKEA PAX frames for both niches (58 deep), with sliding doors in the bedroom.
- IKEA TRONES shoe cabinet 52 x 18 x 39.
- IKEA BLALIDEN glass cabinet 35 x 32 x 151.

## 15. Source material

- `samples/floorplan-empty.png`: the measured empty plan.
- `layouts/`: importable layouts. `tools/make-layouts.js` holds every position.
- `docs/image-prompts.md`: one image prompt per room, all sharing one style block.
- Nadja's four-page notes and the reference images were supplied by the owners and are not stored in this project.

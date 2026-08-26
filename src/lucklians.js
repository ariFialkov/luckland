/* ============================================================
   Luckland — Lucklians
   ------------------------------------------------------------
   Native creatures hidden across the provinces. Walking through
   habitat tiles (especially tall grass and brush) can spring a
   hidden patch: a wild Lucklian appears on — or peering out of —
   terrain that matches its type. Catching one costs a snare
   whose odds are priced honestly against the species' value
   (per-species RTP), and captures live in the Lucklipedia,
   where they can be sold — 8 open-market sales a day, with
   wandering traders offering off-market deals above or below
   face value.
   ============================================================ */

import { CONFIG } from './config.js';
import { hash2, roll } from './rng.js';
import { T, PROV_LIST, PROVINCES } from './world.js';
import { state, spend, payout } from './state.js';
import { showModal, closeModal, escapeHtml, toast, renderBalance, isModalOpen } from './ui.js';
import { getLucklianSprite } from './sprites.js';

/* ------------------------------------------------------------
   Species table. rare = encounter share AND rarity (fraction).
   a = sprite archetype, c = [body, belly/secondary, accent].
   ------------------------------------------------------------ */
const D = [
  [1, 'Aurellon', 'Grass', 'TF', 24, 'quad', '#e8dcc0', '#d9b545', '#e8a020', 'Slender cream quadruped with folded ears, sun-gold dorsal fur, amber eyes and glassy hooves adapted to hot limestone meadows.'],
  [2, 'Yanshara', 'Grass', 'DG', 18, 'rodent', '#b0492e', '#3d8a5c', '#7a2e1a', 'Rust-red rodent with jade throat plumage, backward-sweeping whiskers and a whip-long balancing tail used among tall river grasses.'],
  [3, 'Bristlejack', 'Dust', 'HV', 27, 'hare', '#a5713f', '#d9c49a', '#26202c', 'Long-legged prairie hopper with dusty russet fur, shovel-like feet and stiff black dorsal quills that rattle while sprinting.'],
  [4, 'Velmoss', 'Grass', 'FL', 21, 'hare', '#7ab54f', '#5a8f3d', '#a8d078', 'Apple-green rabbit-sized grazer with woolly moss-textured fur and four broad leaflike ear flaps.'],
  [5, 'Saphai', 'Grass', 'EP', 16, 'quad', '#b5793f', '#e8dcc0', '#8a5a2a', 'Delicate cinnamon mouse-deer with cream spotting, elongated wetland toes and enormous swiveling ears.'],
  [6, 'Miruku', 'Grass', 'MN', 19, 'rodent', '#3a3642', '#ff8ac0', '#26202c', 'Plump charcoal nocturnal grazer with luminous pink ear interiors and huge black eyes reflecting artificial light in concentric rings.'],
  [7, 'Elysune', 'Grass', 'TF', 0.65, 'hare', '#f4f0e6', '#e8c040', '#c8e8f0', 'Spectacular snow-white hare with extraordinarily long golden ears, translucent legs and an iridescent mane visible most clearly at dawn.'],
  [8, 'Caldrune', 'Dirt', 'TF', 17, 'mole', '#e0d8c8', '#c46a3a', '#9a8f80', 'Broad digging beast with chalk-white hide, terracotta belly plates and huge foreclaws polished smooth by limestone soil.'],
  [9, 'Huangroot', 'Dirt', 'DG', 11, 'mole', '#c49038', '#a5713f', '#8a5a2a', 'Low six-legged ochre burrower with overlapping scales, whiskerlike sensory tendrils and a wedge-shaped shovel snout.'],
  [10, 'Grubhorn', 'Dirt', 'HV', 22, 'mole', '#8a6a4a', '#6a5038', '#5a5652', 'Stocky armadillo analogue with cracked brown plating, blunt iron-grey brow horns and disproportionately large digging paws.'],
  [11, 'Brumblemunk', 'Dirt', 'FL', 14, 'rodent', '#7a5230', '#4f8a3d', '#8fae5a', 'Chestnut burrower whose shaggy dorsal coat accumulates moss, seedlings and fungi until adults resemble moving patches of turf.'],
  [12, 'Kharuun', 'Dirt', 'EP', 9.5, 'mole', '#2c2830', '#c46a3a', '#3a3642', 'Heavy black-scaled digger with clay-orange face, hooked claws and a flattened head for forcing through tangled root systems.'],
  [13, 'Denkiri', 'Dirt', 'MN', 12, 'mole', '#4a4652', '#b0b8c8', '#8fd8ff', 'Hairless charcoal burrower with translucent ears and blue-white whiskers that brighten around buried electrical infrastructure.'],
  [14, 'Xialung', 'Dirt', 'DG', 0.4, 'lizard', '#8a2a1e', '#e8dcc0', '#4f9c7e', 'Horse-sized subterranean reptile with dark cinnabar armor, ivory sensory whiskers and a crown of worn jade-colored head plates.'],
  [15, 'Aurex', 'Dust', 'TF', 14, 'moth', '#e8e0d0', '#d9b545', '#f0c040', 'Hand-sized ivory moth with metallic wing edges that releases clouds of gold-colored scales into dry Mediterranean air.'],
  [16, 'Zhaoyun', 'Dust', 'DG', 8.5, 'dragon', '#b03030', '#d05050', '#e8a020', 'Finger-thin flying reptile with crimson membrane wings and a long feathered tail that coils through warm air currents.'],
  [17, 'Whistler Wisp', 'Dust', 'HV', 19, 'bird', '#ded4c0', '#c4b49a', '#26202c', 'Tiny pale desert bird with elongated tail streamers, nearly invisible inside dust clouds except for two glossy black eyes.'],
  [18, 'Feydrift', 'Dust', 'FL', 7.8, 'wisp', '#5abfa8', '#8fd8c8', '#d8f4ec', 'Weightless blue-green insectivore surrounded by a permanent halo of fine insulating fibers shed from its downy body.'],
  [19, 'Somchai', 'Jungle', 'EP', 11, 'moth', '#33282e', '#8a5a9a', '#c49038', 'Broad black moth with bronze eye-spots and scalloped wings stained violet by mineral-rich jungle soils.'],
  [20, 'Glitchwing', 'Dirt', 'MN', 5.4, 'bat', '#3a3642', '#b8d8e8', '#8fd8ff', 'Transparent-winged bat-insect whose microscopic reflective scales fracture signs and streetlights into shifting rectangular fragments.'],
  [21, 'Vesperyx', 'Dust', 'TF', 0.32, 'moth', '#4a4652', '#ded4c0', '#c8ccd8', 'Elusive charcoal moth with six cream wings and mirrored abdominal scales; appears almost silver when emerging from volcanic dust.'],
  [22, 'Pentelix', 'Rock', 'TF', 4.2, 'tortoise', '#ded4c0', '#4a4642', '#e8a020', 'Tortoise-like reptile with ivory stone-textured armor, charcoal joints and amber mineral veins visible through its shell.'],
  [23, 'Fongtoad', 'Rock', 'DG', 8.6, 'toad', '#5a6068', '#3fb0a0', '#464e58', 'Huge flattened toad with slate scales, turquoise throat sac and jagged brow ridges resembling weathered mountain stone.'],
  [24, 'Ironshell', 'Rock', 'HV', 11, 'beetle', '#9a5230', '#7a3e22', '#26202c', 'Low eight-legged crawler covered in rust-colored mineral plates and armed with thick black crushing mandibles.'],
  [25, 'Cairnkin', 'Rock', 'FL', 9.5, 'tortoise', '#8a8478', '#6d6860', '#7d9a52', 'Round reptile whose irregular grey armor supports lichen and moss, making sleeping individuals nearly indistinguishable from cairns.'],
  [26, 'Angkara', 'Rock', 'EP', 3.8, 'tortoise', '#5a5044', '#b09a6a', '#4f8a3d', 'Enormous dark tortoise with sandstone-colored shell ridges; vines and small epiphytes commonly grow between its plates.'],
  [27, 'Kurogane', 'Rock', 'MN', 6.3, 'beetle', '#26222c', '#3a3642', '#8fd8ff', 'Glossy black hexapod with mirrorlike armor that catches nearby signage as razor-sharp streaks of moving color.'],
  [28, 'Pebbletick', 'Rock', 'HV', 15, 'beetle', '#c49038', '#a5713f', '#8a6a4a', 'Palm-sized ochre scavenger with six springing legs and pebble-shaped dorsal shell; gathers in huge colonies around warm rocks.'],
  [29, 'Aurelstag', 'Forest', 'TF', 5.8, 'deer', '#e8e0d0', '#8fa060', '#e8a020', 'Tall ivory deer with sweeping asymmetrical amber antlers and a dense mantle of pale olive-green neck fur.'],
  [30, 'Qinshara', 'Forest', 'DG', 8.2, 'deer', '#8a4a2e', '#3d8a5c', '#b06038', 'Red-brown deer-reptile with jade throat scales, long facial tendrils and ribbon-thin tail plumes used in forest displays.'],
  [31, 'Blackspur', 'Dust', 'HV', 11, 'deer', '#5a5044', '#ded4c0', '#26202c', 'Lean dark mule deer with hooked black antlers, pale facial blaze and scarred knees adapted to dry wooded ravines.'],
  [32, 'Eirwyn', 'Forest', 'FL', 4.1, 'deer', '#7a8a6a', '#5a6a4e', '#2f5a2a', 'Massive moss-grey cervid whose branching green-black antlers naturally host ferns, lichens and flowering epiphytes.'],
  [33, 'Vantara', 'Forest', 'EP', 7.8, 'feline', '#252a48', '#e8dcc0', '#e8c040', 'Midnight-blue predator with gold-ringed eyes, pale throat ruff and luminous irregular spots that mimic fireflies through foliage.'],
  [34, 'Yorunuki', 'Forest', 'MN', 6.7, 'fox', '#2c2830', '#b8b0c0', '#a86ae0', 'Fox-raccoon analogue with oily black fur, silver facial mask, huge ears and tail hairs that fluoresce violet under artificial light.'],
  [35, 'Vesperon', 'Forest', 'TF', 3.3, 'feline', '#6a2a38', '#e8dcc0', '#c49038', 'Compact wine-dark feline with bronze rosettes and a cream mane extending from forehead to shoulders.'],
  [36, 'Hongwei', 'Forest', 'DG', 6.1, 'bird', '#d43a2a', '#3fb0a0', '#f0c040', 'Brilliant vermilion ground bird with turquoise wing plates and two meter-long golden display feathers.'],
  [37, 'Coppergrin', 'Dust', 'HV', 13, 'fox', '#b0602a', '#e8dcc0', '#26202c', 'Narrow-faced rust fox with black cheek patches, enormous ears and coarse metallic-looking copper tail hairs.'],
  [38, 'Sylvarrow', 'Forest', 'FL', 5.2, 'fox', '#b8bcc0', '#5a8f3d', '#2f5a2a', 'Long-legged silver predator with fernlike cheek fur, dark green paws and four narrow balancing tails.'],
  [39, 'Moonhart', 'Forest', 'FL', 0.18, 'deer', '#d8d4dc', '#b8c8d8', '#a8e8c8', 'Towering pearl-grey cervid whose enormous translucent antlers carry curtains of hanging moss that faintly luminesce beneath moonlight.'],
  [40, 'Veyara', 'Jungle', 'EP', 4.6, 'primate', '#7a6248', '#5a8f3d', '#8a6a4a', 'Six-limbed arboreal browser with bark-patterned skin, dangling mosslike fur and forearms resembling banyan roots.'],
  [41, 'Shinjura', 'Forest', 'MN', 7.1, 'primate', '#2c2830', '#e05a70', '#3fd8e8', 'Compact black primate with bright facial skin and reflective cyan throat patches used to communicate through illuminated canopy.'],
  [42, 'Orphix', 'Forest', 'TF', 5.7, 'serpent', '#2f7a44', '#c49038', '#e8dcc0', 'Heavy emerald constrictor with bronze-edged scales and a cream dorsal stripe broken into intricate labyrinth patterns.'],
  [43, 'Jiulong', 'Jungle', 'DG', 3.5, 'lizard', '#3d8a4c', '#c43a2a', '#2f6a30', 'Long green climbing reptile with whiskered jaw, red dorsal fins and hooklike scales allowing it to cling vertically to trees.'],
  [44, 'Redmaw', 'Dust', 'HV', 8.4, 'lizard', '#c49038', '#26202c', '#c43a2a', 'Broad monitor with black jaws, ochre hide and clusters of beadlike crimson scales surrounding its eyes.'],
  [45, 'Dromhain', 'Grass', 'FL', 6.2, 'serpent', '#2b5e2a', '#26202c', '#4f8a3d', 'Deep-green arboreal serpent with branching hornlets and interwoven black markings mimicking overlapping vines.'],
  [46, 'Suryani', 'Jungle', 'EP', 5.1, 'feline', '#e08a2a', '#d8c8f0', '#e8dcc0', 'Small orange feline with violet-white floral rosettes, leaf-shaped ears and extraordinarily long gripping toes.'],
  [47, 'Kabukirn', 'Forest', 'MN', 2.7, 'deer', '#2c2830', '#c8ccd8', '#8fd8ff', 'Delicate black browsing creature with translucent branching horns and iridescent shell-like shoulder plates.'],
  [48, 'Kharumi', 'Jungle', 'EP', 12, 'moth', '#2a4a9a', '#b8d8e8', '#5eeaff', 'Thumb-sized sapphire insect with four transparent wings; vast glittering swarms emerge after tropical rainfall.'],
  [49, 'Virekh', 'Jungle', 'EP', 0.24, 'lizard', '#2f8a3c', '#e05a9a', '#1f6130', 'Rare emerald ambush predator with orchidlike facial flaps and an enormous hinged jaw hidden beneath layers of leaf-mimicking skin.'],
  [50, 'Helion', 'Sand', 'TF', 5.8, 'beetle', '#e8e0d0', '#2a4a9a', '#f0c040', 'Large ivory beetle with lapis abdomen and metallic wing cases that flash brilliant gold under direct sunlight.'],
  [51, 'Shawei', 'Sand', 'DG', 7.5, 'serpent', '#d9b545', '#c49038', '#c43a2a', 'Golden serpentine reptile with paddle limbs and crimson head crest that swims beneath loose dunes.'],
  [52, 'Spurcoil', 'Sand', 'HV', 9.1, 'serpent', '#a5713f', '#e8dcc0', '#8a8478', 'Thick rust-and-cream sand viper whose segmented metallic-looking tail produces a sharp chiming rattle.'],
  [53, 'Dunemoss', 'Sand', 'FL', 4.2, 'beetle', '#c49038', '#3d8a4c', '#8a6a4a', 'Broad bronze beetle with emerald shell patches and hooked hairs that collect fragments of vegetation.'],
  [54, 'Sangkha', 'Sand', 'EP', 3.3, 'serpent', '#d9b545', '#3a3080', '#c43a2a', 'Golden hooded serpent with indigo throat, crimson eye ridges and ceramic-smooth overlapping scales.'],
  [55, 'Pachiskit', 'Sand', 'MN', 6.7, 'crab', '#c8ccd8', '#e8a860', '#ffb060', 'Palm-sized crab with mirrored legs and translucent shell revealing softly orange luminous organs.'],
  [56, 'Vaelune', 'Sand', 'DG', 0.19, 'dragon', '#e8e4ec', '#d8c8f0', '#b8d8e8', 'Rare translucent dune wyrm with pearlescent scales and a long dorsal sail that bends sunlight, making its silhouette appear displaced.'],
  [57, 'Thalassyn', 'Sea', 'TF', 4.6, 'fish', '#2a5a9a', '#e8e0d0', '#b8bcc0', 'Sleek cobalt fish with three long ivory tail fins, metallic lateral stripe and pointed dolphinlike snout.'],
  [58, 'Lanlong', 'Sea', 'DG', 3.1, 'fish', '#3fb0a0', '#c43a2a', '#8fd8c8', 'Extremely elongated turquoise seahorse with red whisker filaments and translucent fins rippling continuously along its body.'],
  [59, 'Rustjaw', 'Sea', 'HV', 6.2, 'fish', '#c4a878', '#6a5038', '#8a6a4a', 'Sand-colored shark with dark saddle markings, brown serrated teeth and a battered sail-like dorsal fin.'],
  [60, 'Morwyn', 'Sea', 'FL', 7.4, 'seal', '#4a4642', '#3d8a5c', '#e8dcc0', 'Charcoal seal with emerald mottling, long white whiskers and four small rear flukes arranged radially.'],
  [61, 'Serephai', 'Sea', 'EP', 2.6, 'ray', '#3a3080', '#e08ab0', '#f0c040', 'Enormous indigo ray with pink-gold radial markings and trailing fins that undulate like submerged flower petals.'],
  [62, 'Akihara', 'Sea', 'MN', 5.3, 'fish', '#26222c', '#5eeaff', '#ff6be0', 'Jet-black fish with translucent scales refracting surrounding light into shifting cyan, pink and violet bands.'],
  [63, 'Oracline', 'Sea', 'TF', 1.8, 'ceph', '#e8e4dc', '#c49038', '#2a5a9a', 'Pearl-white cephalopod with bronze spiral shell and dozens of thin cobalt tentacles tipped with yellow photophores.'],
  [64, 'Xianlu', 'Sea', 'DG', 3.8, 'lizard', '#3fb0a0', '#c46a3a', '#e8dcc0', 'Broad turquoise marine reptile with red-gold dorsal plates and pale sensory whiskers framing its mouth.'],
  [65, 'Brinewhistler', 'Sea', 'HV', 8.1, 'fish', '#e8dcc0', '#8a6a4a', '#26202c', 'Slender cream seahorse analogue with curled facial barbels and dark radial markings surrounding each eye.'],
  [66, 'Tirglas', 'Sea', 'FL', 4.1, 'lizard', '#8fb8c8', '#4f8a3d', '#3d8a5c', 'Delicate silver-blue amphibian with streaming green mane indistinguishable from kelp while submerged.'],
  [67, 'Abyssara', 'Sea', 'TF', 0.09, 'ceph', '#1c1c3a', '#e8e0d0', '#f0c040', 'Huge midnight cephalopod with ivory spiral armor and a crown of transparent tentacles illuminated internally by slow-moving golden pulses.'],
  [68, 'Olympyr', 'Mountain', 'TF', 3.4, 'ram', '#e8e4dc', '#e8c040', '#d9b545', 'Towering white ibex with translucent amber horns, gold facial stripe and long windblown cream coat.'],
  [69, 'Tianzhu', 'Mountain', 'DG', 2.2, 'deer', '#b03030', '#3d8a5c', '#e8e4dc', 'Crimson-scaled mountain ungulate with jade mane, branching antlers and pale vapor constantly escaping its nostrils.'],
  [70, 'Flintcrest', 'Mountain', 'HV', 5.6, 'ram', '#4a4642', '#6d6860', '#8a8478', 'Massive dusty-black ram with layered iron-grey horns and chipped stone-colored shoulder armor.'],
  [71, 'Caerwyn', 'Mountain', 'FL', 4.4, 'ram', '#6a8a5a', '#5a6068', '#c8e8f0', 'Moss-green goat with crystalline horn tips, shaggy slate coat and alpine flowers caught throughout its wool.'],
  [72, 'Kintara', 'Mountain', 'EP', 1.7, 'primate', '#e8e4dc', '#e8a020', '#2c2830', 'Long-armed white primate with saffron shoulder mantle, black face and extraordinarily elongated gripping fingers.'],
  [73, 'Raijinka', 'Rock', 'MN', 2.8, 'fox', '#2c2830', '#b8bcc0', '#3f8ae8', 'Lean black fox with enormous angular ears, reflective paws and narrow blue bioluminescent lines following its ribs.'],
  [74, 'Caelgryph', 'Mountain', 'TF', 0.9, 'raptor', '#e8e0d0', '#c49560', '#c49038', 'Eagle-lion predator with ivory plumage, tawny hindquarters and bronze flight feathers visible from valleys below.'],
  [75, 'Yunshao', 'Mountain', 'DG', 1.3, 'dragon', '#d8dce4', '#b8d8e8', '#e8e4ec', 'Pale flying serpent with huge translucent fins and filamentous white mane that gathers beads of condensation in flight.'],
  [76, 'Flintback', 'Mountain', 'HV', 7.5, 'rodent', '#6a6058', '#8a8478', '#e08a2a', 'Chunky grey-brown burrower with stone-hard dorsal plates and broad orange incisors; colonies cover sunny high-altitude slopes.'],
  [77, 'Stormcrown Qirren', 'Mountain', 'DG', 0.12, 'deer', '#26222c', '#b0602a', '#d8d4dc', 'Near-black mountaintop beast with branching copper horns and a pale mane that rises vertically from accumulated static charge.'],
  [78, 'Namaru', 'River', 'EP', 4.8, 'seal', '#5a3a24', '#e8dcc0', '#e08ab0', 'Chocolate-brown otter analogue with cream muzzle and broad tail covered in naturally pink scale-like markings.'],
  [79, 'Mizuneko', 'Sea', 'MN', 3.1, 'feline', '#3a3642', '#26202c', '#3fd8e8', 'Amphibious charcoal feline with webbed paws, enormous reflective eyes and cyan sensory whiskers visible beneath dark water.'],
  [80, 'Valtiber', 'River', 'TF', 2.5, 'serpent', '#6a7a3a', '#e8e0d0', '#e8a020', 'Bronze-green aquatic serpent with ivory fins, broad amber eyes and polished tilelike scales.'],
  [81, 'Lianjiang', 'River', 'DG', 1.6, 'lizard', '#3f6ac8', '#e8e4dc', '#c8d8f0', 'Azure six-legged salamander predator with pale whiskers and bulbous opalescent air-storage throat.'],
  [82, 'Paddleback', 'River', 'HV', 5.9, 'tortoise', '#6a5038', '#8a6a4a', '#a5793f', 'Huge brown turtle with overlapping ridged shell plates and a broad shovel jaw for riverbed feeding.'],
  [83, 'Avenloch', 'Sea', 'FL', 4.1, 'fish', '#3d8a5c', '#b8bcc0', '#2f5a2a', 'Metallic green salmon with four-part tail, speckled back and streaming pectoral fins.'],
  [84, 'Phayao', 'River', 'EP', 2.2, 'fish', '#b8d8e8', '#ffb060', '#8fd8ff', 'Long iridescent fish with transparent scales and a chain of luminous internal organs visible through its sides.'],
  [85, 'Flickerfin', 'Sea', 'MN', 5.1, 'fish', '#c8ccd8', '#ff8ac0', '#5eeaff', 'Thin silver fish whose skin flashes blocks of pink, blue and white according to surrounding artificial illumination.'],
  [86, 'Tiberax', 'River', 'TF', 0.11, 'serpent', '#e8dcc0', '#c49038', '#f0c040', 'Enormous cream river serpent with bronze dorsal fins and a mane of hair-thin golden sensory filaments flowing around its skull.'],
  [87, 'Aurevane', 'Sand', 'TF', 2.1, 'raptor', '#e8dcc0', '#26202c', '#e8c040', 'Huge cream raptor with black primary feathers, amber crown plumage and intensely reflective golden eyes.'],
  [88, 'Chiyara', 'Rock', 'DG', 1.4, 'lizard', '#c43a2a', '#3fb0a0', '#e8c040', 'Scarlet cliff reptile with hooked gold claws, turquoise belly and long whiskers sensitive to updrafts.'],
  [89, 'Highmesa Condor', 'Cliff', 'HV', 3.8, 'raptor', '#4a3630', '#e8dcc0', '#c43a2a', 'Enormous rust-black scavenger with cream crescent wing markings and bare crimson head.'],
  [90, 'Caerwail', 'Cliff', 'FL', 1.9, 'raptor', '#e8e4ec', '#3d8a5c', '#c8ccd8', 'Ghost-pale falcon with emerald throat and extraordinarily long primary feathers that whistle during steep dives.'],
  [91, 'Rakhana', 'Mountain', 'EP', 0.8, 'bird', '#26222c', '#e8c040', '#e08a2a', 'Massive black-and-gold hornbill with orange throat pouch and layered weathered-stone casque.'],
  [92, 'Glassraven', 'Rock', 'MN', 2.7, 'bird', '#26222c', '#8a70c0', '#e8e4ec', 'Oil-black corvid whose mirrorlike feathers produce moving rainbow bands; stark white eyes dominate its silhouette at night.'],
  [93, 'Solyrian', 'Sand', 'TF', 1.2, 'raptor', '#e8e4dc', '#e8c040', '#d9b545', 'Long-tailed white raptor with golden breast and ribbonlike stabilizing tail vanes.'],
  [94, 'Jinmao', 'Mountain', 'DG', 0.42, 'dragon', '#c43a2a', '#c49038', '#f0c040', 'Lion-faced flying reptile with bronze mane, crimson scales and immense ribbed soaring wings.'],
  [95, 'Screegrub', 'Cliff', 'HV', 5.8, 'beetle', '#b0492e', '#8a3a22', '#c46a3a', 'Tiny rust-red six-legged grazer with flat gripping feet; thousands cover sun-warmed cliff faces after dusk.'],
  [96, 'Palegrave Owl', 'Cliff', 'HV', 2.7, 'owl', '#e8e4dc', '#b0602a', '#3a3642', 'Huge white owl with rust facial disk, charcoal talons and ragged wind-worn plumage.'],
  [97, 'Eirfrost', 'Snow', 'FL', 4.3, 'hare', '#f0f0f4', '#8fd8c8', '#5a8f3d', 'Long white hare with translucent green ear tips, enormous snowshoe feet and moss-green dorsal spotting.'],
  [98, 'Khaovei', 'Snow', 'EP', 0.9, 'quad', '#e8e4dc', '#5a6068', '#e8c040', 'Heavy ivory tapir with slate legs, pale-gold facial stripe and exceptionally thick neck fur.'],
  [99, 'Yukimori', 'Snow', 'MN', 1.35, 'fox', '#f0f0f4', '#26202c', '#5eeaff', 'Round white predator with black mask, glassy blue claws and fur tips that fluoresce cyan during polar darkness.'],
  [100, 'Aurorix', 'Snow', 'TF', 1.8, 'fox', '#d8dce4', '#b8c8d8', '#a8e8c8', 'Long-legged silver fox whose translucent dorsal fur refracts moonlight into faint green and violet bands.'],
  [101, 'Bailong', 'Snow', 'DG', 0.55, 'dragon', '#f0f0f4', '#c8e8f0', '#8fd8ff', 'Huge white serpentine reptile with transparent dorsal spines, ice-blue eyes and several-meter sensory whiskers.'],
  [102, 'Whitewraith Courser', 'Snow', 'DG', 0.7, 'quad', '#e8e4ec', '#8a8890', '#26202c', 'Gaunt ivory equine with smoky mane, black lower legs and extraordinarily broad feet adapted for deep snow.'],
  [103, 'Gwyndell', 'Snow', 'FL', 2.2, 'deer', '#e8e4dc', '#c8e8f0', '#2f5a2a', 'Tiny pale antlered mammal with featherlike insulation and dark green branching horns.'],
  [104, 'Himavara', 'Snow', 'EP', 0.48, 'primate', '#e8e4ec', '#3a3080', '#c8ccd8', 'Silver-white primate with immense shoulder mantle and indigo face; snow accumulates inside its hollow outer fur.'],
  [105, 'Lumifox', 'Snow', 'MN', 3.1, 'fox', '#f0f0f4', '#26202c', '#ff6be0', 'White fox with elongated black ears and pale magenta bioluminescent tissue beneath its facial fur.'],
  [106, 'Frostveil Sovereign', 'Snow', 'FL', 0.035, 'deer', '#f4f4f8', '#a8e8c8', '#8fd8c8', 'Legendary elk-sized white beast with translucent emerald antlers and a trailing coat of hair so fine it resembles frozen mist.'],
  [107, 'Astraphel', 'Neon', 'TF', 0.22, 'quad', '#26222c', '#e8e0d0', '#e8a020', 'Tall black winged quadruped with metallic ivory pinions and amber vascular light glowing beneath otherwise pitch-dark skin.'],
  [108, 'Hongdian', 'Neon', 'DG', 0.31, 'dragon', '#6a1818', '#26202c', '#f0c040', 'Enormous crimson-black flying serpent lined from jaw to tail with naturally luminous gold photophores.'],
  [109, 'Voltjack', 'Neon', 'HV', 1.2, 'hare', '#26222c', '#e08a2a', '#3f8ae8', 'Jet-black jackalope analogue with branching translucent antlers that fluoresce orange-blue around electrical infrastructure.'],
  [110, 'Virid Wispheart', 'Neon', 'FL', 0.64, 'wisp', '#8dff6b', '#c8ffb0', '#e8ffd0', 'Small hovering organism with four transparent wings surrounding an intensely luminous emerald core.'],
  [111, 'Veyakhan Nighttiger', 'Neon', 'EP', 0.18, 'feline', '#26222c', '#f0c040', '#e8c040', 'Enormous black jungle cat whose gold bioluminescent stripes dissolve into hundreds of luminous dots along its limbs.'],
  [112, 'Wiremite', 'Neon', 'MN', 3.8, 'beetle', '#3a3642', '#b8d8e8', '#3f8ae8', 'Tiny six-legged urban scavenger with translucent abdomen and electric-blue antennae; thrives around warm cables and illuminated machinery.'],
  [113, 'Solvane', 'Neon', 'TF', 0.42, 'owl', '#26222c', '#e8c040', '#e8a020', 'Midnight owl with metallic gold facial feathers and concentric amber photophores surrounding completely black eyes.'],
  [114, 'Jiuzhu', 'Neon', 'DG', 0.15, 'dragon', '#1c1c2c', '#3fd8e8', '#ff6be0', 'Slender midnight dragon with nine enlarged throat organs that illuminate sequentially in different hues.'],
  [115, 'Deadlight Courser', 'Neon', 'HV', 0.48, 'quad', '#26222c', '#e08a2a', '#ffb060', 'Skeletal-looking black equine with thin orange luminous tissue visible between armored ribs and glassy obsidian hooves.'],
  [116, 'Faelumen', 'Neon', 'FL', 0.13, 'wisp', '#8fd8c8', '#c8ccd8', '#e8ffd0', 'Hand-sized airborne vertebrate with seven transparent wings, emerald abdomen and long silver sensory filaments.'],
  [117, 'Suryak Naga', 'Neon', 'EP', 0.12, 'serpent', '#3d8a4c', '#8a70c0', '#8dff6b', 'Giant translucent serpent with visible emerald organs, violet dorsal sails and hundreds of luminous throat scales.'],
  [118, 'Yorukage', 'Neon', 'MN', 0.07, 'feline', '#1c1c24', '#c8ccd8', '#5eeaff', 'Extremely long black feline with nine ribbonlike balancing tails, mirror-silver face and flowing cyan-magenta bioluminescence.'],
  [119, 'Moiravex', 'Neon', 'TF', 0.025, 'feline', '#d8d4c8', '#e8e0d0', '#f0c040', 'Mythically rare leonine predator with ivory wings, serpentine tail and three luminous filaments trailing several body lengths behind it.'],
  [120, 'Mugenrai', 'Neon', 'MN', 0.01, 'ray', '#16161e', '#3fd8e8', '#ff6be0', 'Colossal nocturnal glider with ink-black manta-feline body, translucent fins filled with moving rainbow photophores and a vast forked tail.'],
  /* ---- v1.1: everyday Lucklians — common, low-value locals so the
     same face doesn't greet every patch. One of each general type
     per province, named in the local style. ---- */
  [121, 'Ovistra', 'Grass', 'TF', 26, 'ram', '#d8d2c0', '#e8e2d4', '#c49038', 'Small dove-grey meadow sheep with a marble-white face, tightly curled cream fleece and amber hooves that click on warm limestone.'],
  [122, 'Cindralis', 'Dust', 'TF', 22, 'rodent', '#b0a898', '#d8d2c0', '#c46a3a', 'Ash-grey scurrier with terracotta paws and a flat brush tail it drags to erase its own tracks from the dust.'],
  [123, 'Litorin', 'Sand', 'TF', 24, 'crab', '#e8d49a', '#e8e2d4', '#2a5a9a', 'Thumbnail beach crab with a sun-bleached shell and lapis leg joints; skitters in crowds along the wave line at dusk.'],
  [124, 'Petrapod', 'Rock', 'TF', 21, 'beetle', '#c8c0ac', '#a8a094', '#e8a020', 'Squat six-legged pebble-carrier whose chalky carapace is flecked with amber mineral grit from the cliffs it grazes.'],
  [125, 'Capriole', 'Mountain', 'TF', 18, 'ram', '#e8e0d0', '#c8c0ac', '#8a6a4a', 'Knee-high mountain kid with stubby ridged horns and outsized rubbery hooves, forever bounding between ledges.'],
  [126, 'Delphara', 'Sea', 'TF', 20, 'fish', '#8fb8c8', '#e8e0d0', '#2a5a9a', 'Palm-length silver darter with a cobalt back stripe that flickers through harbour shallows in quick schools.'],
  [127, 'Meiling', 'Grass', 'DG', 25, 'hare', '#b5793f', '#e8dcc0', '#3d8a5c', 'Round river-meadow hare with cinnamon fur, jade-tinted ear rims and cheeks always packed with tall grass seed.'],
  [128, 'Shatu', 'Dust', 'DG', 20, 'lizard', '#c49560', '#e8d49a', '#c43a2a', 'Finger-length dust skink with sandy scales and a vermilion throat dot, always basking on warm courtyard stones.'],
  [129, 'Jinsha', 'Sand', 'DG', 22, 'beetle', '#d9b545', '#c49038', '#f0c040', 'Bright gold-shelled scarab that rolls beads of river sand; its polished back flashes like a dropped coin.'],
  [130, 'Shiwei', 'Rock', 'DG', 19, 'tortoise', '#8a8478', '#6d6860', '#3d8a5c', 'Fist-sized pebble turtle with a jade-veined stone shell, common wherever mountain walls meet the paddies.'],
  [131, 'Yunzu', 'Mountain', 'DG', 17, 'bird', '#d8dce4', '#e8e4dc', '#c43a2a', 'Chubby cloud-grey finch with a crimson chin who nests in trail-side cairns and scolds passing travellers.'],
  [132, 'Haidan', 'Sea', 'DG', 21, 'fish', '#3fb0a0', '#e8dcc0', '#e8a020', 'Small turquoise bay fish with a golden eye ring, netted by the basketful along the Dragon\'s Bay shore.'],
  [133, 'Tumbletuft', 'Grass', 'HV', 26, 'rodent', '#c4a878', '#e8dcc0', '#8a6a4a', 'Round prairie rodent that curls into a ball of dry grass and rolls with the wind between grazing spots.'],
  [134, 'Puffquail', 'Dust', 'HV', 28, 'bird', '#c49560', '#e8d49a', '#5a3a24', 'Dumpy dust-bathing quail with a bobbing head plume; whole coveys erupt underfoot in a puff of ochre.'],
  [135, 'Grittle', 'Sand', 'HV', 23, 'lizard', '#d0a86a', '#e8d49a', '#26202c', 'Stub-tailed sand lizard with grit-stuck scales and black eye bands, fond of napping in wagon ruts.'],
  [136, 'Rockchuck', 'Rock', 'HV', 24, 'rodent', '#8a7258', '#c4a878', '#e08a2a', 'Whistling mesa marmot with stone-brown fur and orange incisors, sunning on every warm boulder in the west.'],
  [137, 'Cragmutton', 'Mountain', 'HV', 18, 'ram', '#a5713f', '#8a6a4a', '#5a5652', 'Shaggy free-roaming range sheep with chipped grey horns and wool full of burrs and red trail dust.'],
  [138, 'Sandsnapper', 'Sea', 'HV', 20, 'crab', '#c4a878', '#e8d49a', '#c43a2a', 'Mud-coloured coastal crab with one comically oversized claw it waves at anything that walks the shore.'],
  [139, 'Cloverkit', 'Grass', 'FL', 27, 'rodent', '#7ab54f', '#a8d078', '#e8e070', 'Pocket-sized green-tinged vole that weaves clover stems into its fur; a lucky find that is not rare at all.'],
  [140, 'Brynwren', 'Dust', 'FL', 19, 'bird', '#a5713f', '#e8dcc0', '#4f8a3d', 'Tiny russet moor wren with a moss-green tail flick, hopping the dry stone walls between pastures.'],
  [141, 'Shorlin', 'Sand', 'FL', 22, 'bird', '#d9c49a', '#e8e4dc', '#26202c', 'Long-legged little sandpiper with pearl belly and ink-dipped beak, chasing every retreating wave.'],
  [142, 'Mossclamber', 'Rock', 'FL', 20, 'tortoise', '#7d9a52', '#8a8478', '#4f8a3d', 'Slow round-shelled climber carpeted in living moss; often mistaken for a stone until it yawns.'],
  [143, 'Bryncair', 'Mountain', 'FL', 16, 'ram', '#8a8478', '#6a8a5a', '#c8e8f0', 'Sturdy highland goat with slate wool, lichen stains and pale horn tips worn smooth on cairn stones.'],
  [144, 'Selkin', 'Sea', 'FL', 21, 'seal', '#6a6058', '#b8bcc0', '#e8dcc0', 'Sleek little harbour seal with silver mottling and white whiskers, begging fish scraps off every pier.'],
  [145, 'Chanthi', 'Grass', 'EP', 24, 'rodent', '#b5793f', '#e8dcc0', '#3d8a4c', 'Cheerful cinnamon grass rat with leaf-green ear tufts, threading tunnels through the wet meadow stems.'],
  [146, 'Takrit', 'Dust', 'EP', 18, 'lizard', '#a5713f', '#c49560', '#3fb0a0', 'Quick ochre gecko with turquoise toe pads, chirping from sun-baked temple walls and dusty lanes.'],
  [147, 'Pukhao', 'Sand', 'EP', 22, 'crab', '#e8d49a', '#c49038', '#e05a70', 'Pale ghost crab with rose-tipped claws that sculpts perfect sand spheres outside its burrow.'],
  [148, 'Hinlok', 'Rock', 'EP', 20, 'beetle', '#5a5044', '#8a8478', '#3d8a4c', 'Stone-backed jungle beetle whose mossy shell blends into the boulders it polishes with its feet.'],
  [149, 'Doiwan', 'Mountain', 'EP', 15, 'primate', '#8a7258', '#e8dcc0', '#e8a020', 'Small whiskered mountain macaque with a saffron face ring, picking berries along the mist-trail switchbacks.'],
  [150, 'Plangi', 'Sea', 'EP', 21, 'fish', '#3f8ae8', '#e8dcc0', '#ffb060', 'Striped lagoon fish with apricot fins, schooling so thickly the shallows appear to boil at dawn.'],
  [151, 'Kusanezu', 'Grass', 'MN', 25, 'rodent', '#6a6058', '#a8d078', '#ff8ac0', 'Grey park mouse with grass-stained paws and a pink nose, nesting under vending machines and hedges alike.'],
  [152, 'Hokorin', 'Dust', 'MN', 19, 'moth', '#b0a898', '#d8d4c8', '#ffe066', 'Soft grey alley moth dusted with glowing motes; drawn to warm signage and shaken rugs.'],
  [153, 'Sunahiki', 'Sand', 'MN', 23, 'crab', '#c8ccd8', '#e8d49a', '#5eeaff', 'Busy little beach crab with a chrome-flecked shell that rakes neat furrows across the tide flats.'],
  [154, 'Ishimaru', 'Rock', 'MN', 21, 'tortoise', '#6d6860', '#8a8478', '#ff6be0', 'Round city turtle with a worn cobblestone shell, dozing in rock gardens and neon puddle light.'],
  [155, 'Yamako', 'Mountain', 'MN', 16, 'fox', '#b0602a', '#e8dcc0', '#26202c', 'Compact island fox with soot-tipped ears and tail, trotting the shrine steps above the neon line.'],
  [156, 'Shioneri', 'Sea', 'MN', 22, 'fish', '#8fb8c8', '#c8ccd8', '#ff8ac0', 'Slim tide-runner with a rosy lateral stripe that surges up the strait with every incoming flood.'],
  [157, 'Glaslin', 'River', 'FL', 20, 'fish', '#3d8a5c', '#b8bcc0', '#4f8a3d', 'Little emerald stream trout with silver speckles, flickering between the stones of every highland beck.'],

  /* ---- the freshwater expansion: rivers got busier ---- */
  [158, 'Nishikoi', 'River', 'MN', 21, 'fish', '#e05a30', '#f4f0e6', '#e8a020', 'Plump orange-and-white canal koi with mirror scales that catch the neon; considered lucky by everyone except the odds.'],
  [159, 'Pontifin', 'River', 'TF', 23, 'fish', '#e8e0d0', '#3f6ac8', '#c49038', 'Marble-white aqueduct fish with cobalt fin edging, schooling wherever engineered water runs straight and cool.'],
  [160, 'Jangyu', 'River', 'DG', 19, 'toad', '#4f8a3d', '#e8c040', '#8a5a2a', 'Round paddy toad with a gold throat and mud-brown saddle, croaking the water level to anyone who listens.'],
  [161, 'Silttoe', 'River', 'HV', 20, 'crab', '#8a6a4a', '#c4a878', '#c43a2a', 'Creek crawdad-crab caked in dried mud, waving one chipped red claw at prospectors panning its gravel.'],
  [162, 'Bramblegill', 'River', 'FL', 9, 'fish', '#7a3040', '#a8d078', '#2f5a2a', 'Wine-dark highland perch with thorn-spined green fins, lurking under brambles that overhang slow pools.'],
  [163, 'Lomduang', 'River', 'EP', 18, 'bird', '#e8e4dc', '#e08a2a', '#26202c', 'Slim ivory river-wader with a saffron bill, standing motionless midstream for hours between lightning strikes at minnows.'],
  [164, 'Jinweaver', 'River', 'DG', 0.8, 'serpent', '#e8c040', '#c43a2a', '#f0e0a0', 'Gold-scaled eel that braids the current itself into slow spirals; the braids persist minutes after it leaves.'],
  [165, 'Naga Chandra', 'River', 'EP', 0.14, 'serpent', '#d8d4dc', '#3a3080', '#c8e8f0', 'The moon naga of the Cyan River: a pearl-white serpent with indigo crescent markings, surfacing only where moonlight touches moving water.'],

  /* ---- the saltwater expansion: the coasts fill in ---- */
  [166, 'Buoybelly', 'Sea', 'TF', 22, 'fish', '#e8a020', '#f4f0e6', '#c43a2a', 'Round harbour puffer striped like a mooring buoy; inflates when startled and drifts off on the current, resigned.'],
  [167, 'Amphoraxi', 'Sea', 'TF', 6.5, 'ceph', '#c46a3a', '#e8dcc0', '#2a5a9a', 'Small terracotta octopus that homes in sunken amphorae, decorating its jar mouth with blue pottery shards.'],
  [168, 'Denglongyu', 'Sea', 'DG', 20, 'fish', '#c43a2a', '#e8c040', '#ffe066', 'Crimson bay fish with a glowing lantern-shaped tail lure, trailing junks at dusk in bobbing red strings.'],
  [169, 'Perlong', 'Sea', 'DG', 2.9, 'ray', '#3d8a5c', '#e8e4dc', '#f0e0c8', 'Jade ray of Dragon\'s Bay with a back inlaid in nacre lumps; divers swear each pearl marks a storm it outswam.'],
  [170, 'Gullysnap', 'Sea', 'HV', 21, 'toad', '#c4a878', '#3fb0a0', '#26202c', 'Leathery tidepool toad with a teal throat sac, snapping brine-flies off the rocks between waves.'],
  [171, 'Sailspur', 'Sea', 'HV', 7.2, 'fish', '#b0602a', '#e8dcc0', '#4a4642', 'Rangy copper garfish with a ragged dorsal sail and a jaw like a bent nail, cruising the surf line at a swagger.'],
  [172, 'Cockleglim', 'Sea', 'FL', 19, 'crab', '#8fb8c8', '#4f9c5e', '#ffe066', 'Wee hermit crab housed in a faintly glowing cockle shell; beaches full of them read as fallen constellations at night.'],
  [173, 'Finnbarra', 'Sea', 'FL', 1.1, 'seal', '#26222c', '#b8bcc0', '#c8e8f0', 'A great black selkie bull with a silver storm-mantle, hauled out alone on skerries no boat can approach twice.'],
  [174, 'Talaykot', 'Sea', 'EP', 20, 'crab', '#5a8f3d', '#c49038', '#e05a30', 'Mangrove crab with a moss-green shell and orange-tipped legs, farming neat gardens of algae between the roots.'],
  [175, 'Morakot', 'Sea', 'EP', 8.4, 'tortoise', '#2f8a5c', '#e8dcc0', '#e8c040', 'Emerald sea turtle whose shell plates hold the exact green of the shallows; surfaces in pairs on the warmest tides.'],
  [176, 'Chao Thalay', 'Sea', 'EP', 0.2, 'ceph', '#3a3080', '#e8a020', '#ff6be0', 'The Lord of the Warm Water: a deep-indigo cephalopod crowned in gold-ringed tentacles, said to surface once per reign to inspect the fishing fleet.'],
];

const LK = CONFIG.LUCKLIAN;

/* nice rounding for coin amounts */
function niceRound(v) {
  if (v < 100) return Math.max(10, Math.round(v));
  if (v < 1000) return Math.round(v / 5) * 5;
  return Math.round(v / 25) * 25;
}

export function speciesRtp(id) {
  return LK.RTP_MIN + hash2(id * 7 + 3, id * 13 + 1, 90210) * (LK.RTP_MAX - LK.RTP_MIN);
}
export function speciesValue(rareFrac) {
  return niceRound(22 * Math.pow(0.24 / rareFrac, 0.88));
}

export const LUCKLIANS = D.map(([id, name, type, prov, rarePct, a, c0, c1, c2, desc]) => {
  const rare = rarePct / 100;
  return {
    id, name, type, prov, desc, rare, a, c: [c0, c1, c2],
    rtp: speciesRtp(id),
    value: speciesValue(rare),
    glow: type === 'Neon',
  };
});
export const BY_ID = new Map(LUCKLIANS.map((l) => [l.id, l]));

/* Two tones per tier: `color` glows on the dark game stage, `ink` stays
   legible on the light parchment panels (dex cards, hunt cards, lobbies). */
export function rarityTier(rare) {
  if (rare >= 0.15) return { name: 'Common', color: '#b8c4b0', ink: '#5a6753' };
  if (rare >= 0.07) return { name: 'Uncommon', color: '#7dd87a', ink: '#2e7d36' };
  if (rare >= 0.025) return { name: 'Rare', color: '#5eb3ff', ink: '#1b62b8' };
  if (rare >= 0.006) return { name: 'Epic', color: '#c58cff', ink: '#7033c4' };
  if (rare >= 0.0015) return { name: 'Legendary', color: '#ffb84d', ink: '#a85c00' };
  return { name: 'Mythic', color: '#ff6be0', ink: '#b81a94' };
}

/* ------------------------------------------------------------
   Snares — the capture devices. Odds are honest: a throw's
   expected return is snare cost x the species' RTP, so
   chance = cost x rtp / value (capped so nothing is a lock).
   ------------------------------------------------------------ */
export const SNARES = [
  { id: 'copper', name: 'Copper Snare', ico: '🪤', cost: 15 },
  { id: 'silver', name: 'Silver Snare', ico: '🥈', cost: 60 },
  { id: 'gilded', name: 'Gilded Snare', ico: '🥇', cost: 250 },
  { id: 'prism', name: 'Prismatic Snare', ico: '💠', cost: 1000 },
  { id: 'veil', name: 'Fatebinder Veil', ico: '🕸️', cost: 4000 },
];

export function catchChance(def, snare) {
  return Math.min(LK.MAX_CATCH, (snare.cost * def.rtp) / def.value);
}

/* ------------------------------------------------------------
   Habitat matching — which Lucklian types the tile you stepped
   on (and the solid tiles beside it) can hide.
   ------------------------------------------------------------ */
function waterKind(world, x, y) {
  return world.provAt(x, y) === 'SEA' ? 'Sea' : 'River';
}

export function habitatTypes(world, tx, ty) {
  const types = new Map(); // type -> spawn tile [x, y] for the visual
  const put = (tp, x, y) => { if (!types.has(tp)) types.set(tp, [x, y]); };
  const here = world.get(tx, ty);
  if (here === T.GRASS || here === T.MEADOW || here === T.FLOWERS || here === T.TALLGRASS || here === T.HILL) put('Grass', tx, ty);
  if (here === T.DUST || here === T.SCRUB) put('Dust', tx, ty);
  if (here === T.TRAIL || here === T.WETSAND) { put('Dirt', tx, ty); put('Dust', tx, ty); }
  if (here === T.SAND) { put('Sand', tx, ty); put('Dust', tx, ty); }
  if (here === T.BUSH) { put('Grass', tx, ty); put('Forest', tx, ty); put('Jungle', tx, ty); }
  if (here === T.SHALLOW) put(waterKind(world, tx, ty), tx, ty);
  if (here === T.NEON || here === T.ROAD || here === T.PLAZA) put('Neon', tx, ty);
  // solid habitat radiates outward: being NEAR a mountain, treeline or
  // shore is enough — closest matching tile hosts the creature visual
  const RING = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1], [2, 0], [-2, 0], [0, 2], [0, -2],
    [2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2],
  ];
  for (const [dx, dy] of RING) {
    const x = tx + dx, y = ty + dy;
    const t = world.get(x, y);
    if (t === T.FOREST) put('Forest', x, y);
    else if (t === T.JUNGLE) put('Jungle', x, y);
    else if (t === T.MOUNTAIN) { put('Mountain', x, y); put('Rock', x, y); put('Cliff', x, y); put('Snow', x, y); }
    else if (t === T.PEAK) { put('Snow', x, y); put('Mountain', x, y); }
    else if (t === T.CLIFF) { put('Cliff', x, y); put('Rock', x, y); }
    else if (t === T.WATER || t === T.DEEP || t === T.SHALLOW || t === T.TIDAL) put(waterKind(world, x, y), x, y);
  }
  return types;
}

/* encounter frequency per tile stepped on (Pokemon-style, frequency-based) */
function encounterRate(tile) {
  if (tile === T.TALLGRASS || tile === T.BUSH) return LK.RATE_BRUSH;
  if (tile === T.NEON || tile === T.ROAD || tile === T.PLAZA) return LK.RATE_URBAN;
  return LK.RATE_WILD;
}

let cooldown = 0;
export function tickEncounterCooldown(dt) { cooldown = Math.max(0, cooldown - dt); }
/* can an outside system (the Great Migration) spring an encounter right now? */
export function encounterReady() { return !isModalOpen() && cooldown <= 0; }
export function armEncounterCooldown(s = 3) { cooldown = Math.max(cooldown, s); }

let active = null; // {def, x, y} — rendered in the world while the modal is up
export function getActiveEncounter() { return active; }

/* Called once per NEW tile the player steps onto. */
export function maybeEncounter(world, tx, ty, provCode) {
  if (isModalOpen() || cooldown > 0) return;
  const tile = world.get(tx, ty);
  const rate = encounterRate(tile);
  if (roll() > rate) return;
  const types = habitatTypes(world, tx, ty);
  if (!types.size) return;
  // wading off a beach reads as 'SEA' — creatures belong to the nearest shore
  if (provCode === 'SEA') {
    outer: for (let r2 = 1; r2 <= 5; r2++) {
      for (let dy = -r2; dy <= r2; dy++) for (let dx = -r2; dx <= r2; dx++) {
        const p = world.provAt(tx + dx, ty + dy);
        if (p !== 'SEA') { provCode = p; break outer; }
      }
    }
    if (provCode === 'SEA') return;
  }
  const pool = LUCKLIANS.filter((l) => l.prov === provCode && types.has(l.type));
  if (!pool.length) return;
  let total = 0;
  for (const l of pool) total += l.rare;
  let r = roll() * total;
  let def = pool[pool.length - 1];
  for (const l of pool) { r -= l.rare; if (r <= 0) { def = l; break; } }
  const [sx, sy] = types.get(def.type);
  cooldown = 3;
  openEncounter(def, sx, sy);
}

/* ------------------------------------------------------------
   Encounter modal
   ------------------------------------------------------------ */
function ensureLk() {
  if (!state.lk) state.lk = { caught: {}, seen: {}, sales: 0, salesDay: '' };
  const today = new Date().toDateString();
  if (state.lk.salesDay !== today) { state.lk.salesDay = today; state.lk.sales = 0; }
  return state.lk;
}
export function ownedCount(id) { return ensureLk().caught[id] || 0; }
export function salesLeft() { ensureLk(); return Math.max(0, LK.DAILY_SALES - state.lk.sales); }

/* Any capture — snare, rod or otherwise — lands here. Interested
   parties (the Grand Scavenger Hunt) register a hook; it fires a
   beat after the catch so the catching modal has already closed. */
let catchHook = null;
export function setCatchHook(fn) { catchHook = fn; }
export function recordCatch(def) {
  const l = ensureLk();
  l.seen[def.id] = true;
  l.caught[def.id] = (l.caught[def.id] || 0) + 1;
  state.stats.lucklians = (state.stats.lucklians || 0) + 1;
  if (catchHook) setTimeout(() => catchHook(def), 350);
}

function spriteImg(def, sil = false, big = false) {
  const cv = getLucklianSprite(def, sil);
  return `<img src="${cv.toDataURL()}" class="lk-sprite${big ? ' big' : ''}" alt="">`;
}

export function openEncounter(def, sx, sy) {
  const lk = ensureLk();
  const isNew = !lk.seen[def.id];
  lk.seen[def.id] = true;
  active = { def, x: sx, y: sy, t: 0 };
  const tier = rarityTier(def.rare);
  const rows = SNARES.map((s) => {
    const ch = catchChance(def, s);
    return `<button class="btn lk-snare" data-snare="${s.id}" ${state.balance < s.cost ? 'disabled' : ''}>
      <span>${s.ico} ${s.name}</span>
      <span class="lk-odds">${s.cost} 🪙 · ${ch >= 0.01 ? Math.round(ch * 100) + '%' : (ch * 100).toFixed(2) + '%'}</span>
    </button>`;
  }).join('');
  const m = showModal(`
    <h2>${isNew ? '✨ ' : ''}A wild ${escapeHtml(def.name)}!</h2>
    <div class="subtitle"><span style="color:${tier.ink};font-weight:bold">${tier.name}</span> · ${escapeHtml(def.type)} Lucklian of ${escapeHtml(PROVINCES[def.prov]?.name || def.prov)}${isNew ? ' · <b>new species!</b>' : ''}</div>
    <div class="lk-stage">${spriteImg(def, false, true)}</div>
    <div class="lk-desc">${escapeHtml(def.desc)}</div>
    <div class="lk-value">Face value <b>${def.value.toLocaleString('en-US')}</b> 🪙 — pick a snare:</div>
    <div class="lk-snares">${rows}</div>
    <div class="lk-result" id="lk-result"></div>
    <div class="btn-row"><button class="btn secondary" id="lk-flee">Back away slowly</button></div>
  `, { onClose: () => { active = null; cooldown = Math.max(cooldown, 2.5); } });
  document.getElementById('lk-flee').addEventListener('click', closeModal);
  let busy = false;
  m.querySelectorAll('.lk-snare').forEach((btn) => btn.addEventListener('click', () => {
    if (busy) return;
    const snare = SNARES.find((s) => s.id === btn.dataset.snare);
    if (!snare || !spend(snare.cost)) return;
    busy = true;
    renderBalance();
    const res = document.getElementById('lk-result');
    res.innerHTML = `${snare.ico} The snare settles over the ${escapeHtml(def.name)}…`;
    setTimeout(() => {
      busy = false;
      if (roll() < catchChance(def, snare)) {
        recordCatch(def);
        active = null;
        closeModal();
        toast(`🧿 Caught <b>${escapeHtml(def.name)}</b>! (worth ${def.value.toLocaleString('en-US')} 🪙) — it's in your Lucklipedia`, def.rare < 0.006);
      } else if (roll() < LK.FLEE_CHANCE) {
        active = null;
        closeModal();
        toast(`💨 The ${escapeHtml(def.name)} slipped away!`);
      } else {
        res.innerHTML = `💢 It broke free! The ${escapeHtml(def.name)} is still here…`;
        m.querySelectorAll('.lk-snare').forEach((b) => {
          const s2 = SNARES.find((s) => s.id === b.dataset.snare);
          b.disabled = state.balance < s2.cost;
        });
      }
    }, 900);
  }));
}

/* ------------------------------------------------------------
   Lucklipedia — the encyclopedia + market
   ------------------------------------------------------------ */
export function openLucklipedia(scrollTop = 0) {
  const lk = ensureLk();
  const discovered = LUCKLIANS.filter((l) => lk.seen[l.id]).length;
  const owned = LUCKLIANS.reduce((n, l) => n + (lk.caught[l.id] || 0), 0);
  const worth = LUCKLIANS.reduce((n, l) => n + (lk.caught[l.id] || 0) * l.value, 0);
  const provOrder = ['TF', 'FL', 'HV', 'DG', 'EP', 'MN'];
  const sections = provOrder.map((p) => {
    const cards = LUCKLIANS.filter((l) => l.prov === p).map((l) => {
      const n = lk.caught[l.id] || 0;
      const tier = rarityTier(l.rare);
      if (!lk.seen[l.id]) {
        return `<div class="lk-card unknown"><div class="lk-num">#${l.id}</div><div class="lk-q">?</div></div>`;
      }
      const img = spriteImg(l, n === 0);
      const sell = n > 0
        ? `<button class="btn tiny lk-sell" data-id="${l.id}" ${salesLeft() === 0 ? 'disabled' : ''}>Sell · ${l.value.toLocaleString('en-US')}</button>`
        : `<div class="lk-unseen">seen</div>`;
      return `<div class="lk-card" title="${escapeHtml(l.desc)}">
        <div class="lk-num">#${l.id}</div>
        ${img}
        <div class="lk-name" style="color:${tier.ink}">${escapeHtml(l.name)}</div>
        <div class="lk-meta">${escapeHtml(l.type)}${n > 0 ? ` · x${n}` : ''}</div>
        ${sell}
      </div>`;
    }).join('');
    return `<h3 class="lk-prov">${escapeHtml(PROVINCES[p].name)}</h3><div class="lk-grid">${cards}</div>`;
  }).join('');
  const m = showModal(`
    <h2>🧿 Lucklipedia</h2>
    <div class="subtitle">${discovered}/${LUCKLIANS.length} species discovered · ${owned} in your care (worth ${worth.toLocaleString('en-US')} 🪙)
      · <b>${salesLeft()}</b> of ${LK.DAILY_SALES} market sales left today</div>
    <div class="lk-book">${sections}</div>
  `);
  const book = m.querySelector('.lk-book');
  if (scrollTop) book.scrollTop = scrollTop;
  m.querySelectorAll('.lk-sell').forEach((btn) => btn.addEventListener('click', () => {
    const def = BY_ID.get(+btn.dataset.id);
    if (!def || salesLeft() === 0 || (lk.caught[def.id] || 0) === 0) return;
    lk.caught[def.id] -= 1;
    lk.sales += 1;
    payout(def.value);
    renderBalance();
    toast(`🪙 Sold a ${escapeHtml(def.name)} for ${def.value.toLocaleString('en-US')} — ${salesLeft()} market sales left today`);
    openLucklipedia(book.scrollTop); // re-render in place, keeping the reader's spot
  }));
}

/* ------------------------------------------------------------
   Wandering traders — off-market offers above or below face
   value. They don't count against the daily sales cap, which
   is the whole reason a lowball is sometimes worth taking.
   ------------------------------------------------------------ */
const TRADER_NAMES = ['Trader Moxie', 'Broker Han', 'Collector Ophelia', 'Rancher Bill', 'Curator Nim', 'Dealer Kiku', 'Madame Verity'];

export function maybeTraderOffer() {
  if (isModalOpen()) return false;
  const lk = ensureLk();
  const ownedIds = Object.keys(lk.caught).filter((id) => lk.caught[id] > 0);
  if (!ownedIds.length) return false;
  const def = BY_ID.get(+ownedIds[(roll() * ownedIds.length) | 0]);
  const qty = Math.min(lk.caught[def.id], roll() < 0.3 ? 1 + ((roll() * 3) | 0) : 1);
  const factor = 0.62 + roll() * 0.76; // 0.62x .. 1.38x face value
  const each = niceRound(def.value * factor);
  const total = each * qty;
  const who = TRADER_NAMES[(roll() * TRADER_NAMES.length) | 0];
  const good = each >= def.value;
  const m = showModal(`
    <h2>🤝 ${escapeHtml(who)}</h2>
    <div class="subtitle">flags you down on the road…</div>
    <div class="lk-stage">${spriteImg(def, false, true)}</div>
    <div class="lk-desc">“That ${escapeHtml(def.name)} of yours — ${qty > 1 ? `all ${qty} of them, ` : ''}I'll pay
      <b>${each.toLocaleString('en-US')} 🪙 each</b> (${good ? 'above' : 'below'} the ${def.value.toLocaleString('en-US')} face value${good ? '!' : ''}).
      ${qty > 1 ? `That's <b>${total.toLocaleString('en-US')} 🪙</b> all told.` : ''}
      Private deal — won't touch your market quota.”</div>
    <div class="btn-row">
      <button class="btn" id="lk-deal">Shake on it · +${total.toLocaleString('en-US')} 🪙</button>
      <button class="btn secondary" id="lk-nodeal">Not for sale</button>
    </div>
  `);
  document.getElementById('lk-nodeal').addEventListener('click', closeModal);
  document.getElementById('lk-deal').addEventListener('click', () => {
    if ((lk.caught[def.id] || 0) < qty) { closeModal(); return; }
    lk.caught[def.id] -= qty;
    payout(total);
    renderBalance();
    closeModal();
    toast(`🤝 ${escapeHtml(who)} bought ${qty > 1 ? qty + '× ' : ''}${escapeHtml(def.name)} for ${total.toLocaleString('en-US')} 🪙`);
  });
  return true;
}

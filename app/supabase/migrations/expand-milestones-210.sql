-- Expand milestone library from 41 to 210 (full EYLF coverage)
-- 7 domains × 6 age brackets × 5 milestones = 210

-- Clear existing milestones (no FK references from other tables — bapp_logs.data stores IDs in JSONB)
DELETE FROM bapp_milestones;

-- Re-insert all 210 milestones
INSERT INTO bapp_milestones (id, domain, age_bracket, description, sort_order) VALUES

-- ==========================================================================
-- 0-3 MONTHS
-- ==========================================================================

-- Communication & Language
('CL-03-A',  'CL',  '0-3 months', 'Expresses needs through cries',                 1),
('CL-03-B',  'CL',  '0-3 months', 'Makes throaty noises when content',              2),
('CL-03-C',  'CL',  '0-3 months', 'Soothed by familiar voices',                     3),
('CL-03-D',  'CL',  '0-3 months', 'Begins to coo and gurgle',                       4),
('CL-03-E',  'CL',  '0-3 months', 'May copy simple sounds',                         5),

-- Personal, Social & Emotional
('PSE-03-A', 'PSE', '0-3 months', 'Smiles at people',                               6),
('PSE-03-B', 'PSE', '0-3 months', 'Makes eye contact',                              7),
('PSE-03-C', 'PSE', '0-3 months', 'Shows excitement at feeding time',               8),
('PSE-03-D', 'PSE', '0-3 months', 'Bonds with caregivers',                          9),
('PSE-03-E', 'PSE', '0-3 months', 'Cries when needs are unmet',                    10),

-- Physical Development
('PD-03-A',  'PD',  '0-3 months', 'Lifts head and chest when on stomach',          11),
('PD-03-B',  'PD',  '0-3 months', 'Moves arms and legs actively',                  12),
('PD-03-C',  'PD',  '0-3 months', 'Grasps objects with hands',                     13),
('PD-03-D',  'PD',  '0-3 months', 'Turns head towards sounds',                     14),
('PD-03-E',  'PD',  '0-3 months', 'Starts to roll over',                           15),

-- Literacy
('LIT-03-A', 'LIT', '0-3 months', 'Listens to voices and sounds',                  16),
('LIT-03-B', 'LIT', '0-3 months', 'Recognizes familiar voices',                     17),
('LIT-03-C', 'LIT', '0-3 months', 'Exposed to books and stories',                   18),
('LIT-03-D', 'LIT', '0-3 months', 'Associates sounds with actions',                 19),
('LIT-03-E', 'LIT', '0-3 months', 'Develops early communication skills for literacy', 20),

-- Numeracy
('NUM-03-A', 'NUM', '0-3 months', 'Notices patterns and routines',                  21),
('NUM-03-B', 'NUM', '0-3 months', 'Recognizes faces and objects',                   22),
('NUM-03-C', 'NUM', '0-3 months', 'Begins object permanence',                      23),
('NUM-03-D', 'NUM', '0-3 months', 'Explores environment with senses',              24),
('NUM-03-E', 'NUM', '0-3 months', 'Understands basic cause and effect',             25),

-- Understanding the World
('UW-03-A',  'UW',  '0-3 months', 'Alert to faces and voices',                     26),
('UW-03-B',  'UW',  '0-3 months', 'Follows objects with eyes',                     27),
('UW-03-C',  'UW',  '0-3 months', 'Reaches for toys',                              28),
('UW-03-D',  'UW',  '0-3 months', 'Explores objects by mouthing',                  29),
('UW-03-E',  'UW',  '0-3 months', 'Shows interest in new stimuli',                 30),

-- Expressive Arts & Design
('EAD-03-A', 'EAD', '0-3 months', 'Coos as early musical expression',              31),
('EAD-03-B', 'EAD', '0-3 months', 'Moves arms/legs rhythmically',                  32),
('EAD-03-C', 'EAD', '0-3 months', 'Explores textures with hands/mouth',            33),
('EAD-03-D', 'EAD', '0-3 months', 'Imitates facial expressions',                   34),
('EAD-03-E', 'EAD', '0-3 months', 'Shows interest in colorful objects/lights',     35),

-- ==========================================================================
-- 3-6 MONTHS
-- ==========================================================================

-- Communication & Language
('CL-36-A',  'CL',  '3-6 months', 'Babbles with complex sounds',                   36),
('CL-36-B',  'CL',  '3-6 months', 'Responds to name',                              37),
('CL-36-C',  'CL',  '3-6 months', 'Smiles at mirror image',                        38),
('CL-36-D',  'CL',  '3-6 months', 'Enjoys peek-a-boo games',                       39),
('CL-36-E',  'CL',  '3-6 months', 'Copies sounds and gestures',                    40),

-- Personal, Social & Emotional
('PSE-36-A', 'PSE', '3-6 months', 'Laughs and shows pleasure',                     41),
('PSE-36-B', 'PSE', '3-6 months', 'Reaches to be picked up',                       42),
('PSE-36-C', 'PSE', '3-6 months', 'Shows wariness of strangers',                   43),
('PSE-36-D', 'PSE', '3-6 months', 'Enjoys social interactions',                    44),
('PSE-36-E', 'PSE', '3-6 months', 'May cry when parent leaves',                    45),

-- Physical Development
('PD-36-A',  'PD',  '3-6 months', 'Sits with support',                             46),
('PD-36-B',  'PD',  '3-6 months', 'Rolls back to stomach and vice versa',          47),
('PD-36-C',  'PD',  '3-6 months', 'Grasps objects with both hands',                48),
('PD-36-D',  'PD',  '3-6 months', 'Transfers objects hand-to-hand',                49),
('PD-36-E',  'PD',  '3-6 months', 'Begins to crawl or scoot',                      50),

-- Literacy
('LIT-36-A', 'LIT', '3-6 months', 'Looks at pictures in books',                    51),
('LIT-36-B', 'LIT', '3-6 months', 'Listens to stories and rhymes',                 52),
('LIT-36-C', 'LIT', '3-6 months', 'Associates words with pictures',                53),
('LIT-36-D', 'LIT', '3-6 months', 'Responds to questions with gestures/sounds',    54),
('LIT-36-E', 'LIT', '3-6 months', 'Enjoys being read to',                          55),

-- Numeracy
('NUM-36-A', 'NUM', '3-6 months', 'Explores objects by size/shape',                 56),
('NUM-36-B', 'NUM', '3-6 months', 'Recognizes familiar objects/people',             57),
('NUM-36-C', 'NUM', '3-6 months', 'Understands simple routines',                    58),
('NUM-36-D', 'NUM', '3-6 months', 'Develops object permanence',                     59),
('NUM-36-E', 'NUM', '3-6 months', 'Explores cause and effect',                      60),

-- Understanding the World
('UW-36-A',  'UW',  '3-6 months', 'Explores by shaking/banging objects',            61),
('UW-36-B',  'UW',  '3-6 months', 'Shows curiosity about new things',              62),
('UW-36-C',  'UW',  '3-6 months', 'Understands actions have consequences',         63),
('UW-36-D',  'UW',  '3-6 months', 'May imitate simple actions',                    64),
('UW-36-E',  'UW',  '3-6 months', 'Develops hand-eye coordination',                65),

-- Expressive Arts & Design
('EAD-36-A', 'EAD', '3-6 months', 'Makes noises with toys',                        66),
('EAD-36-B', 'EAD', '3-6 months', 'Scribbles with crayon if held',                 67),
('EAD-36-C', 'EAD', '3-6 months', 'Explores textures/materials',                   68),
('EAD-36-D', 'EAD', '3-6 months', 'Shows interest in music/rhythms',               69),
('EAD-36-E', 'EAD', '3-6 months', 'Imitates simple songs/rhymes',                  70),

-- ==========================================================================
-- 6-12 MONTHS
-- ==========================================================================

-- Communication & Language
('CL-612-A',  'CL',  '6-12 months', 'Says first words',                            71),
('CL-612-B',  'CL',  '6-12 months', 'Understands simple instructions',             72),
('CL-612-C',  'CL',  '6-12 months', 'Uses gestures',                               73),
('CL-612-D',  'CL',  '6-12 months', 'Babbles with inflection',                     74),
('CL-612-E',  'CL',  '6-12 months', 'Responds to simple words',                    75),

-- Personal, Social & Emotional
('PSE-612-A', 'PSE', '6-12 months', 'Shows separation anxiety',                    76),
('PSE-612-B', 'PSE', '6-12 months', 'Plays peek-a-boo games',                      77),
('PSE-612-C', 'PSE', '6-12 months', 'Waves bye-bye',                               78),
('PSE-612-D', 'PSE', '6-12 months', 'Claps hands when happy',                      79),
('PSE-612-E', 'PSE', '6-12 months', 'Shows empathy/concern for others',            80),

-- Physical Development
('PD-612-A',  'PD',  '6-12 months', 'Crawls efficiently',                          81),
('PD-612-B',  'PD',  '6-12 months', 'Pulls to stand, may take steps with support', 82),
('PD-612-C',  'PD',  '6-12 months', 'Uses pincer grasp for small objects',         83),
('PD-612-D',  'PD',  '6-12 months', 'Throws objects',                              84),
('PD-612-E',  'PD',  '6-12 months', 'Sits without support',                        85),

-- Literacy
('LIT-612-A', 'LIT', '6-12 months', 'Turns book pages with help',                  86),
('LIT-612-B', 'LIT', '6-12 months', 'Points to named pictures',                    87),
('LIT-612-C', 'LIT', '6-12 months', 'Engages when being read to',                  88),
('LIT-612-D', 'LIT', '6-12 months', '''Reads'' books by naming pictures',          89),
('LIT-612-E', 'LIT', '6-12 months', 'Understands pictures represent objects',      90),

-- Numeracy
('NUM-612-A', 'NUM', '6-12 months', 'Stacks blocks or cups',                       91),
('NUM-612-B', 'NUM', '6-12 months', 'Understands ''more'' or ''all gone''',         92),
('NUM-612-C', 'NUM', '6-12 months', 'Points to one object when asked',             93),
('NUM-612-D', 'NUM', '6-12 months', 'Explores nesting toys/shape sorters',         94),
('NUM-612-E', 'NUM', '6-12 months', 'Understands simple counting',                 95),

-- Understanding the World
('UW-612-A',  'UW',  '6-12 months', 'Searches for hidden objects',                 96),
('UW-612-B',  'UW',  '6-12 months', 'Imitates actions and sounds',                 97),
('UW-612-C',  'UW',  '6-12 months', 'Explores textures/materials',                 98),
('UW-612-D',  'UW',  '6-12 months', 'Understands cause/effect',                    99),
('UW-612-E',  'UW',  '6-12 months', 'Shows interest in animal sounds',            100),

-- Expressive Arts & Design
('EAD-612-A', 'EAD', '6-12 months', 'Scribbles with crayons',                     101),
('EAD-612-B', 'EAD', '6-12 months', 'Plays with water/sand',                      102),
('EAD-612-C', 'EAD', '6-12 months', 'Imitates drawing lines/circles',             103),
('EAD-612-D', 'EAD', '6-12 months', 'Makes sounds with household items',          104),
('EAD-612-E', 'EAD', '6-12 months', 'Engages in simple pretend play',             105),

-- ==========================================================================
-- 12-18 MONTHS
-- ==========================================================================

-- Communication & Language
('CL-1218-A',  'CL',  '12-18 months', 'Says 15+ single words',                    106),
('CL-1218-B',  'CL',  '12-18 months', 'Uses simple phrases',                      107),
('CL-1218-C',  'CL',  '12-18 months', 'Follows simple instructions',              108),
('CL-1218-D',  'CL',  '12-18 months', 'Points to named objects/pictures',         109),
('CL-1218-E',  'CL',  '12-18 months', 'Asks for things by name',                  110),

-- Personal, Social & Emotional
('PSE-1218-A', 'PSE', '12-18 months', 'Engages in parallel play',                 111),
('PSE-1218-B', 'PSE', '12-18 months', 'Shows independence',                       112),
('PSE-1218-C', 'PSE', '12-18 months', 'Has tantrums when frustrated',             113),
('PSE-1218-D', 'PSE', '12-18 months', 'Seeks comfort from adults',                114),
('PSE-1218-E', 'PSE', '12-18 months', 'Shows possessiveness (''mine'')',           115),

-- Physical Development
('PD-1218-A',  'PD',  '12-18 months', 'Walks alone, may run',                     116),
('PD-1218-B',  'PD',  '12-18 months', 'Climbs on furniture',                      117),
('PD-1218-C',  'PD',  '12-18 months', 'Kicks ball forward',                       118),
('PD-1218-D',  'PD',  '12-18 months', 'Feeds self with fingers/spoon',            119),
('PD-1218-E',  'PD',  '12-18 months', 'Stacks several blocks',                    120),

-- Literacy
('LIT-1218-A', 'LIT', '12-18 months', 'Turns book pages one at a time',           121),
('LIT-1218-B', 'LIT', '12-18 months', 'Names pictures in books',                  122),
('LIT-1218-C', 'LIT', '12-18 months', 'Enjoys ''reading'' familiar books',        123),
('LIT-1218-D', 'LIT', '12-18 months', 'Recognizes some letters/logos',            124),
('LIT-1218-E', 'LIT', '12-18 months', 'Pretends to write/draw letters',           125),

-- Numeracy
('NUM-1218-A', 'NUM', '12-18 months', 'Points to one named object',               126),
('NUM-1218-B', 'NUM', '12-18 months', 'Sorts by shape/color',                     127),
('NUM-1218-C', 'NUM', '12-18 months', 'Counts two/three objects with help',        128),
('NUM-1218-D', 'NUM', '12-18 months', 'Understands ''big'' and ''little''',        129),
('NUM-1218-E', 'NUM', '12-18 months', 'Uses shape sorters/puzzles',                130),

-- Understanding the World
('UW-1218-A',  'UW',  '12-18 months', 'Explores object functions',                131),
('UW-1218-B',  'UW',  '12-18 months', 'Imitates adult activities',                132),
('UW-1218-C',  'UW',  '12-18 months', 'Shows environmental curiosity',            133),
('UW-1218-D',  'UW',  '12-18 months', 'Understands simple time concepts',         134),
('UW-1218-E',  'UW',  '12-18 months', 'Engages in pretend play',                  135),

-- Expressive Arts & Design
('EAD-1218-A', 'EAD', '12-18 months', 'Scribbles with crayons/markers',           136),
('EAD-1218-B', 'EAD', '12-18 months', 'Plays with playdough/clay',                137),
('EAD-1218-C', 'EAD', '12-18 months', 'Draws simple shapes',                      138),
('EAD-1218-D', 'EAD', '12-18 months', 'Sings simple songs',                       139),
('EAD-1218-E', 'EAD', '12-18 months', 'Dances to music',                          140),

-- ==========================================================================
-- 18-24 MONTHS
-- ==========================================================================

-- Communication & Language
('CL-1824-A',  'CL',  '18-24 months', 'Uses two-word phrases',                    141),
('CL-1824-B',  'CL',  '18-24 months', 'Follows two-step instructions',            142),
('CL-1824-C',  'CL',  '18-24 months', 'Names familiar people/objects',            143),
('CL-1824-D',  'CL',  '18-24 months', 'Asks ''what''s that?'' or ''where?''',     144),
('CL-1824-E',  'CL',  '18-24 months', 'Uses pronouns (e.g., ''me,'' ''you'')',    145),

-- Personal, Social & Emotional
('PSE-1824-A', 'PSE', '18-24 months', 'Plays alongside others, begins cooperative play', 146),
('PSE-1824-B', 'PSE', '18-24 months', 'Shows independence in dressing/self-care', 147),
('PSE-1824-C', 'PSE', '18-24 months', 'Has frequent tantrums',                    148),
('PSE-1824-D', 'PSE', '18-24 months', 'Shows affection to familiar people',       149),
('PSE-1824-E', 'PSE', '18-24 months', 'Begins to understand sharing',             150),

-- Physical Development
('PD-1824-A',  'PD',  '18-24 months', 'Walks up/down stairs with help',           151),
('PD-1824-B',  'PD',  '18-24 months', 'Kicks ball without falling',               152),
('PD-1824-C',  'PD',  '18-24 months', 'Jumps in place with both feet',            153),
('PD-1824-D',  'PD',  '18-24 months', 'Feeds self with spoon',                    154),
('PD-1824-E',  'PD',  '18-24 months', 'Opens doors, helps with chores',           155),

-- Literacy
('LIT-1824-A', 'LIT', '18-24 months', 'Turns book pages correctly',               156),
('LIT-1824-B', 'LIT', '18-24 months', 'Names many pictures',                      157),
('LIT-1824-C', 'LIT', '18-24 months', '''Reads'' books from memory',              158),
('LIT-1824-D', 'LIT', '18-24 months', 'Recognizes letters in name',               159),
('LIT-1824-E', 'LIT', '18-24 months', 'Enjoys rhyming games/stories',             160),

-- Numeracy
('NUM-1824-A', 'NUM', '18-24 months', 'Counts three objects accurately',           161),
('NUM-1824-B', 'NUM', '18-24 months', 'Sorts by size/shape/color',                 162),
('NUM-1824-C', 'NUM', '18-24 months', 'Understands ''more'' and ''less''',         163),
('NUM-1824-D', 'NUM', '18-24 months', 'Recognizes numbers 1-5',                    164),
('NUM-1824-E', 'NUM', '18-24 months', 'Uses counting toys/books',                  165),

-- Understanding the World
('UW-1824-A',  'UW',  '18-24 months', 'Pretends to be someone else',              166),
('UW-1824-B',  'UW',  '18-24 months', 'Uses objects symbolically',                167),
('UW-1824-C',  'UW',  '18-24 months', 'Imitates animal sounds',                   168),
('UW-1824-D',  'UW',  '18-24 months', 'Understands spatial concepts (e.g., in, on)', 169),
('UW-1824-E',  'UW',  '18-24 months', 'Asks ''why?'' questions',                  170),

-- Expressive Arts & Design
('EAD-1824-A', 'EAD', '18-24 months', 'Draws controlled lines/circles',           171),
('EAD-1824-B', 'EAD', '18-24 months', 'Uses colors to represent objects',         172),
('EAD-1824-C', 'EAD', '18-24 months', 'Enjoys finger painting',                   173),
('EAD-1824-D', 'EAD', '18-24 months', 'Sings songs, may create own',              174),
('EAD-1824-E', 'EAD', '18-24 months', 'Dances creatively to music',               175),

-- ==========================================================================
-- 24-32 MONTHS
-- ==========================================================================

-- Communication & Language
('CL-2432-A',  'CL',  '24-32 months', 'Uses 2-3 word sentences',                  176),
('CL-2432-B',  'CL',  '24-32 months', 'Asks many questions',                      177),
('CL-2432-C',  'CL',  '24-32 months', 'Follows/retells simple stories',           178),
('CL-2432-D',  'CL',  '24-32 months', 'Uses plurals/past tense',                  179),
('CL-2432-E',  'CL',  '24-32 months', 'Has conversations, takes turns',           180),

-- Personal, Social & Emotional
('PSE-2432-A', 'PSE', '24-32 months', 'Plays cooperatively, shares toys',         181),
('PSE-2432-B', 'PSE', '24-32 months', 'Shows empathy, comforts others',           182),
('PSE-2432-C', 'PSE', '24-32 months', 'Asserts independence (e.g., ''I do it!'')', 183),
('PSE-2432-D', 'PSE', '24-32 months', 'Has imaginary friends/pretend play',       184),
('PSE-2432-E', 'PSE', '24-32 months', 'Follows simple game rules',                185),

-- Physical Development
('PD-2432-A',  'PD',  '24-32 months', 'Runs easily, kicks ball',                  186),
('PD-2432-B',  'PD',  '24-32 months', 'Jumps over small obstacles',               187),
('PD-2432-C',  'PD',  '24-32 months', 'Climbs playground equipment',              188),
('PD-2432-D',  'PD',  '24-32 months', 'Pedals tricycle',                           189),
('PD-2432-E',  'PD',  '24-32 months', 'Uses scissors to cut paper',               190),

-- Literacy
('LIT-2432-A', 'LIT', '24-32 months', 'Recognizes/names some letters',            191),
('LIT-2432-B', 'LIT', '24-32 months', 'Scribbles own name with help',             192),
('LIT-2432-C', 'LIT', '24-32 months', 'Sits through longer stories',              193),
('LIT-2432-D', 'LIT', '24-32 months', 'Understands print has meaning',            194),
('LIT-2432-E', 'LIT', '24-32 months', '''Writes'' with drawings/symbols',         195),

-- Numeracy
('NUM-2432-A', 'NUM', '24-32 months', 'Counts to 10',                             196),
('NUM-2432-B', 'NUM', '24-32 months', 'Sorts by multiple attributes',             197),
('NUM-2432-C', 'NUM', '24-32 months', 'Understands size/weight/length',           198),
('NUM-2432-D', 'NUM', '24-32 months', 'Uses number words in context',             199),
('NUM-2432-E', 'NUM', '24-32 months', 'Engages in math games/puzzles',            200),

-- Understanding the World
('UW-2432-A',  'UW',  '24-32 months', 'Knows name, age, possibly address',        201),
('UW-2432-B',  'UW',  '24-32 months', 'Understands time (e.g., yesterday)',        202),
('UW-2432-C',  'UW',  '24-32 months', 'Shows interest in nature',                 203),
('UW-2432-D',  'UW',  '24-32 months', 'Follows three-step instructions',          204),
('UW-2432-E',  'UW',  '24-32 months', 'Engages in complex pretend play',          205),

-- Expressive Arts & Design
('EAD-2432-A', 'EAD', '24-32 months', 'Draws symbolic people/objects',            206),
('EAD-2432-B', 'EAD', '24-32 months', 'Uses various art materials',               207),
('EAD-2432-C', 'EAD', '24-32 months', 'Sings songs with actions',                 208),
('EAD-2432-D', 'EAD', '24-32 months', 'Enjoys role-playing/dressing up',          209),
('EAD-2432-E', 'EAD', '24-32 months', 'Creates patterns in art/music',            210);

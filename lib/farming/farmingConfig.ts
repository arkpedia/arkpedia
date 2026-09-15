import { FarmingTier } from './farmingTypes';

const ICON_DIR = '/material-icons';

export const TIER_1_2_FOOTNOTE =
  "Apart from Orirock Cubes, avoid farming Tier 1 and Tier 2 materials. Farm only when urgently required.";

export const LEGEND: { kind: 'efficient' | 'focused' | 'alternative' | 'eventActive'; label: string; rest: string }[] = [
  {
    kind: 'eventActive',
    label: 'Farming stages',
    rest: 'should be farmed actively during an ongoing event to also obtain event currency.',
  },
  {
    kind: 'efficient',
    label: 'Efficient stages',
    rest: 'save sanity in the long run through side drops.',
  },
  {
    kind: 'focused',
    label: 'Focused stages',
    rest: 'are slightly less sanity efficient, but have a higher drop rate for the featured resource. Best for if you don\'t care about most side drops.',
  },
  {
    kind: 'alternative',
    label: 'Alternative stages',
    rest: 'should be farmed sparingly. Farm strictly what is necessary until you unlock a better stage.',
  },
];

export const FARMING_TIERS: FarmingTier[] = [
  {
    tier: 1,
    materials: [
      { name: 'Ester', icon: `${ICON_DIR}/Ester.webp`, stages: [{ label: 'S2-7', kind: 'plain' }] },
      { name: 'Sugar Substitute', icon: `${ICON_DIR}/Sugar Substitute.webp`, stages: [{ label: 'S2-6', kind: 'plain' }] },
      { name: 'Orirock', icon: `${ICON_DIR}/Orirock.webp`, stages: [{ label: 'S2-5', kind: 'plain' }] },
      { name: 'Oriron Shard', icon: `${ICON_DIR}/Oriron Shard.webp`, stages: [{ label: 'S2-8', kind: 'plain' }] },
      { name: 'Diketon', icon: `${ICON_DIR}/Diketon.webp`, stages: [{ label: 'S2-9', kind: 'plain' }] },
      { name: 'Damaged Device', icon: `${ICON_DIR}/Damaged Device.webp`, stages: [{ label: '2-3', kind: 'plain' }] },
    ],
  },
  {
    tier: 2,
    materials: [
      {
        name: 'Polyester',
        icon: `${ICON_DIR}/Polyester.webp`,
        stages: [
          { label: '10-16', kind: 'plain' },
          { label: 'S3-2', kind: 'plain' },
        ],
      },
      {
        name: 'Sugar',
        icon: `${ICON_DIR}/Sugar.webp`,
        stages: [
          { label: '11-2', kind: 'plain' },
          { label: '5-3', kind: 'plain' },
          { label: 'S3-1', kind: 'plain' },
        ],
      },
      {
        name: 'Orirock Cube',
        icon: `${ICON_DIR}/Orirock Cube.webp`,
        stages: [{ label: '1-7', kind: 'efficient' }],
      },
      {
        name: 'Oriron',
        icon: `${ICON_DIR}/Oriron.webp`,
        stages: [
          { label: 'M8-7', kind: 'plain' },
          { label: 'S3-3', kind: 'plain' },
        ],
      },
      {
        name: 'Polyketon',
        icon: `${ICON_DIR}/Polyketon.webp`,
        stages: [
          { label: '6-16', kind: 'plain' },
          { label: '3-7', kind: 'plain' },
        ],
      },
      {
        name: 'Device',
        icon: `${ICON_DIR}/Device.webp`,
        stages: [
          { label: '10-4', kind: 'plain' },
          { label: '6-11', kind: 'plain' },
          { label: 'S3-4', kind: 'plain' },
        ],
      },
    ],
  },
  {
    tier: 3,
    materials: [
      {
        name: 'Polyester Pack',
        icon: `${ICON_DIR}/Polyester Pack.webp`,
        stages: [
          { label: '7-4', kind: 'efficient' },
          { label: '2-6', kind: 'alternative' },
        ],
      },
      {
        name: 'Sugar Pack',
        icon: `${ICON_DIR}/Sugar Pack.webp`,
        stages: [
          { label: '14-7', kind: 'efficient' },
          { label: 'MB-6', kind: 'focused' },
          { label: '2-5', kind: 'alternative' },
        ],
      },
      {
        name: 'Orirock Cluster',
        icon: `${ICON_DIR}/Orirock Cluster.webp`,
        stages: [{ label: '1-7', kind: 'efficient', fullLabel: 'Farm from 1-7' }],
      },
      {
        name: 'Oriron Cluster',
        icon: `${ICON_DIR}/Oriron Cluster.webp`,
        stages: [
          { label: '10-11', kind: 'efficient' },
          { label: '14-12', kind: 'focused' },
          { label: 'S4-1', kind: 'alternative' },
        ],
      },
      {
        name: 'Aketon',
        icon: `${ICON_DIR}/Aketon.webp`,
        stages: [
          { label: 'JT8-3', kind: 'efficient' },
          { label: '3-1', kind: 'alternative' },
        ],
      },
      {
        name: 'Integrated Device',
        icon: `${ICON_DIR}/Integrated Device.webp`,
        stages: [
          { label: '9-10', kind: 'efficient' },
          { label: '11-7', kind: 'focused' },
          { label: '3-4', kind: 'alternative' },
        ],
      },
      {
        name: 'Coagulative Nodule',
        icon: `${ICON_DIR}/Coagulative Nodule.webp`,
        stages: [{ label: '15-9', kind: 'efficient' }],
      },
      {
        name: 'Loxic Kohl',
        icon: `${ICON_DIR}/Loxic Kohl.webp`,
        stages: [{ label: 'Event Store', kind: 'eventActive', fullLabel: 'Event Store (Infinite Stock)' }],
      },
      {
        name: 'Manganese Ore',
        icon: `${ICON_DIR}/Manganese Ore.webp`,
        stages: [{ label: 'Event Store', kind: 'eventActive', fullLabel: 'Event Store (Infinite Stock)' }],
      },
      {
        name: 'Grindstone',
        icon: `${ICON_DIR}/Grindstone.webp`,
        stages: [{ label: 'Event Store', kind: 'eventActive', fullLabel: 'Event Store (Infinite Stock)' }],
      },
      {
        name: 'RMA70-12',
        icon: `${ICON_DIR}/RMA70-12.webp`,
        stages: [
          { label: '4-9', kind: 'efficient' },
          { label: '9-19', kind: 'focused' },
          { label: '2-10', kind: 'alternative' },
        ],
      },
      {
        name: 'Incandescent Alloy',
        icon: `${ICON_DIR}/Incandescent Alloy.webp`,
        stages: [
          { label: '11-14', kind: 'efficient' },
          { label: '16-14', kind: 'focused' },
          { label: 'S3-6', kind: 'alternative' },
        ],
      },
      {
        name: 'Coagulating Gel',
        icon: `${ICON_DIR}/Coagulating Gel.webp`,
        stages: [
          { label: '10-3', kind: 'efficient' },
          { label: '14-8', kind: 'focused' },
          { label: 'S5-7', kind: 'alternative' },
        ],
      },
      {
        // Note: the in-game/wiki name is "Crystalline Component"
        name: 'Crystalline Component',
        icon: `${ICON_DIR}/Crystalline Component.webp`,
        stages: [
          { label: 'R8-11', kind: 'efficient' },
          { label: 'S5-9', kind: 'alternative' },
        ],
      },
      {
        name: 'Compound Cutting Fluid',
        icon: `${ICON_DIR}/Compound Cutting Fluid.webp`,
        stages: [
          { label: '12-17', kind: 'efficient' },
          { label: '10-17', kind: 'alternative' },
          { label: '9-6', kind: 'alternative' },
        ],
      },
      {
        name: 'Transmuted Salt',
        icon: `${ICON_DIR}/Transmuted Salt.webp`,
        stages: [
          { label: '12-13', kind: 'efficient' },
          { label: '14-2', kind: 'focused' },
          { label: '11-3', kind: 'alternative' },
        ],
      },
      {
        name: 'Semi-Synthetic Solvent',
        icon: `${ICON_DIR}/Semi-Synthetic Solvent.webp`,
        stages: [
          { label: '9-18', kind: 'efficient' },
          { label: '9-4', kind: 'alternative' },
        ],
      },
      {
        name: 'Fuscous Fiber',
        icon: `${ICON_DIR}/Fuscous Fiber.webp`,
        stages: [{ label: '13-5', kind: 'efficient' }],
      },
      {
        name: 'Aggregate Cyclicene',
        icon: `${ICON_DIR}/Aggregate Cyclicene.webp`,
        stages: [
          { label: '16-15', kind: 'efficient' },
          { label: '13-15', kind: 'alternative' },
        ],
      },
    ],
  },
];
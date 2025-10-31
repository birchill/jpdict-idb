import { ExtendedSense } from './result-types.js';

export interface PosGroup<Sense> {
  pos: Array<string>;
  misc: Array<string>;
  senses: Array<Sense>;
}

export function groupSenses<Sense extends ExtendedSense>(
  senses: Array<Sense>
): Array<PosGroup<Sense>> {
  const groups: Array<PosGroup<Sense>> = [];

  // Do an initial grouping based on the first part-of-speech (POS)
  let previousPos: string | undefined;
  for (const sense of senses) {
    // Look for a match. Note that a match can be one of two kinds:
    //
    // a) Where the sense includes the POS we are grouping on
    // b) Where we currently have a group where there is no POS and the sense
    //    also has no POS.
    if (
      (previousPos && sense.pos && sense.pos.includes(previousPos)) ||
      (!previousPos && groups.length && (!sense.pos || !sense.pos.length))
    ) {
      groups[groups.length - 1]!.senses.push(dropPos(sense, previousPos));
    } else {
      // If there was no match, start a new group
      const thisPos = sense.pos?.length ? sense.pos[0] : undefined;
      const pos = thisPos ? [thisPos] : [];
      groups.push({ pos, misc: [], senses: [dropPos(sense, thisPos)] });
      previousPos = thisPos;
    }
  }

  // Having done the initial grouping, see if there are any additional POS that
  // are common to all senses that we can hoist to the group heading.
  for (const group of groups) {
    let commonPos = group.senses[0]?.pos;
    if (!commonPos) {
      continue;
    }

    for (const sense of group.senses.slice(1)) {
      commonPos = commonPos.filter(
        (pos) => sense.pos && sense.pos.includes(pos)
      );
      if (!commonPos.length) {
        break;
      }
    }

    if (commonPos.length) {
      group.pos.push(...commonPos);
      group.senses = group.senses.map((sense) => dropPos(sense, commonPos));
    }
  }

  // Hoist any common misc readings
  for (const group of groups) {
    let commonMisc = group.senses[0]?.misc;
    if (!commonMisc) {
      continue;
    }

    for (const sense of group.senses.slice(1)) {
      commonMisc = commonMisc.filter(
        (misc) => sense.misc && sense.misc.includes(misc)
      );
      if (!commonMisc.length) {
        break;
      }
    }

    if (commonMisc.length) {
      group.misc = commonMisc;
      group.senses = group.senses.map((sense) => ({
        ...sense,
        misc: sense.misc?.filter((misc) => !commonMisc!.includes(misc)),
      }));
    }
  }

  return groups;
}

// Set up a utility to produce a copy of a sense with the specified
// part(s)-of-speech removed.
function dropPos<Sense extends ExtendedSense>(
  sense: Sense,
  posToDrop: string | Array<string> | undefined
): Sense {
  let pos = sense.pos
    ? sense.pos.filter((pos) =>
        Array.isArray(posToDrop) ? !posToDrop.includes(pos) : pos !== posToDrop
      )
    : undefined;
  if (pos && !pos.length) {
    pos = undefined;
  }

  return { ...sense, pos };
}

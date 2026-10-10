import {defaultGrade,type Grade,type PhaseGrades} from '../scenes/ColorGradePass';
/** Approved visual settings; exposure is measured in EV. */
export const FIXED_GRADE:Grade={
 ...defaultGrade(),
 exposure:0,brightness:0,contrast:1.14,saturation:1.01,temperature:0,tint:0,
 shadows:.87,highlights:-.24,gamma:1.14,
 hsl:[[-6,0,.03],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0]],
 curves:{master:[0,.37,.52,.73,1],red:[0,.25,.5,.75,1],green:[0,.25,.5,.75,1],blue:[0,.25,.5,.75,1]}
};
/** Starting point for each time of day; all three begin as the approved grade, the colour lab tunes them apart. */
export const PHASE_GRADES=():PhaseGrades=>({day:structuredClone(FIXED_GRADE),dusk:structuredClone(FIXED_GRADE),night:structuredClone(FIXED_GRADE)});

export { adaptiveSimpson, adaptiveSimpsonPiecewise, NonFiniteIntegrandError } from './integrate'
export type { IntegrationOptions, IntegrationResult } from './integrate'
export { analyze, formatNumber, numberToTex } from './analyze'
export type { Analysis, AnalysisModel, CurveErrorItem, NumericSummary, PlotData } from './analyze'
export { parseCurve, derivativeOf, expressionToTex, simplifyToString, math } from './parse'
export type { ParsedCurve, ParseFailure, DerivativeInfo } from './parse'
export {
  analyzeMonotonicity,
  findBreakpoints,
  findRoots,
  sampleCurve,
} from './geometry'
export type { MonotonicityInfo, SamplePoint } from './geometry'
export {
  buildMicroElements,
  buildSolid,
  detectMethod,
  horizontalRadii,
  sceneExtent,
} from './solids'
export type { CurveInput, MicroElement, SceneExtent, SolidModel, SolidSpec } from './solids'
export { symbolicDefiniteIntegral } from './symbolic'
export type { SymbolicResult } from './symbolic'

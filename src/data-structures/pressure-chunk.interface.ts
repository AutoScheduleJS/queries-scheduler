import { IRange } from './range.interface';

export interface IPressureChunk extends IRange {
	readonly pressure: number;
}

import { ITimeDuration } from './query.interface';
import { IRange } from './range.interface';

export interface IPotentiality {
	readonly name: string;
	readonly places: ReadonlyArray<IRange>;
	readonly duration: ITimeDuration;
	readonly pressure: number;
}

export interface IPotentialitySimul {
	readonly places: ReadonlyArray<IRange>;
	readonly duration: number;
}

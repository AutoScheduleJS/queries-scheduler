import { ITimeBoundary } from './query.interface';
import { IRange } from './range.interface';

export interface IPotentiality {
	readonly name: string;
	readonly children: ReadonlyArray<IRange>;
	readonly duration: ITimeBoundary;
	readonly pressure: number;
}

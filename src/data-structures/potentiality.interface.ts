import { IRange } from './range.interface';

export interface IPotentiality {
	readonly name: string;
	readonly children: ReadonlyArray<IRange>;
	readonly duration: number;
	readonly potentiel: number;
}

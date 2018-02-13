import { IMaterial } from './material.interface';

export class ConflictError extends Error {
  private materialsIntern: IMaterial[] = [];
  constructor(private id: number, ...params: any[]) {
    super(...params);
  }

  get victim() {
    return this.id;
  }

  set materials(materials: IMaterial[]) {
    this.materialsIntern = [...materials];
  }
  get materials(): IMaterial[] {
    return [...this.materialsIntern];
  }
}

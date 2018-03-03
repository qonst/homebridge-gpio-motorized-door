export abstract class Relay implements IRelay {
    private readonly log: (msg: string) => void;
    constructor(name: string, log: (msg: string) => void) {
        this.log = (msg: string) => log(`${name}: ${msg}`);
    }

    public abstract on(): void;

    public abstract off(): void;

    public abstract get state(): boolean;
}

export interface IRelay {

    on(): void;
    off(): void;

}
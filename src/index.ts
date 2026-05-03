import { undefinedToNull } from "lib0/conditions";
import { isNumber, isString } from "lib0/function";
import { stringify } from "lib0/json";
import { abs, log, pow } from "lib0/math";
import { isEmpty, keys } from "lib0/object";

/**
 * Map of base quantities and their powers that go into this kind of quantity.
 * The base units map to themselves - i.e. length is defined as `{length: 1}`.
 */
export type Dimensions = Record<string, number>;

/**
 * Represents a number with dimensions. Doesn't store the unit, as everything is
 * normalized into the base unit for the dimension. (E.g. if you created a length value
 * in feet, it will be converted and stored in meters.)
 */
class Quantity {
    constructor(
        /**
         * The value of this measurement in the base unit defined for this measurement's kind.
         * For example, a value of 0.012 here with a kind of "length" would mean 12 mm.
         */
        public value: number,
        /**
         * The kind of the dimension, such as "length" or "time". This is NOT a unit like "meters"
         * because everything is stored in the base unit.
         */
        public kind: string | null, // null = dimensionless
    ) { }
}

export { type Quantity };

/**
 * Stores the data needed to convert from and to this unit from the base unit
 * (since {@link Quantity} stores the value in base units).
 */
class UnitDef {
    constructor(
        /**
         * The formal name for the unit (typically plural, e.g. "amperes" instead of "ampere")
         */
        public name: string,
        /**
         * The abbreviation used for the "short" format (e.g. "A" for amperes).
         */
        public abbr: string,
        /**
         * The dimension of something with this unit (e.g. "current" for "amperes")
         */
        public kind: string,
        /**
         * The scaling factor used to convert between this unit and the base unit for its kind.
         * This is always the number of this unit that makes up 1 of the base unit. For example, 0.001 for
         * km because there are 0.001 km in 1 m. Base units have a perBase of 1.
         */
        public perBase: number,
        /**
         * The zero offset for non-affine units (e.g. -273.15 for degrees Celsius since the base is degrees Kelvin).
         */
        public zeroOffset: number,
        /**
         * Other names for this unit, used in parsing (e.g. "amps" for "amperes")
         */
        public aliases: string[],
    ) { }
    /**
     * True if this unit is an affine unit. Affine units have a zeroOffset of 0 from the base, and
     * so can be multiplied and divided with any other kind of unit.
     */
    get isAffine() {
        return this.zeroOffset === 0;
    }
    /**
     * True if this is the base unit for the kind (e.g. true for meters, false for inches).
     */
    get isBase() {
        return this.perBase === 1 && this.isAffine;
    }
    /**
     * @param base Value in base units
     * @returns The number converted to this unit
     */
    fromBase(base: number) {
        return this.perBase * base + this.zeroOffset;
    }
    /**
     * @param value Value in this unit
     * @returns The number converted to the base unit
     */
    toBase(value: number) {
        return (value - this.zeroOffset) / this.perBase;
    }
}

export { type UnitDef };

export class UnitSystem {
    #kinds = new Map<string, Dimensions>();
    #baseUnits = new Map<string, string>(); // kind -> base unit name
    #units = new Map<string, UnitDef>(); // name -> UnitDef
    #kindsExpanded = new Map<string, Dimensions>(); // kind -> decomposed dimensions
    /**
     * @param kind Dimension type, e.g. "length" or "time"
     * @returns base unit name for the dimension, e.g. "meters" or "seconds", or undefined if one is not defined yet
     */
    baseFor(kind: string): string | undefined {
        return this.#baseUnits.get(kind);
    }
    /**
     * A (fresh) list of all known kinds recognized by this unit system.
     */
    get kinds() {
        return [...this.#kinds.keys()];
    }
    /**
     * @returns the kind expanded into its base units or undefined if the kind is not yet recognized
     */
    dimensionsOf(kind: string): Dimensions | undefined {
        return this.#kindsExpanded.get(kind);
    }
    /**
     * @param composition Map of dimensions to their powers or just a single string for `{[string]: 1}`
     * @returns Map with all compound units replaced with their base units
     * @example
     * ```js
     * U.expand({ speed: 1, area: 1 }) // ==> { length: 3, time: -1 }
     * ```
     */
    expand(composition: Dimensions | string | null): Dimensions {
        if (isString(composition)) return this.expand({ [composition]: 1 });
        if (composition === null) return {};
        // Derived kind - expand to base kinds
        const expanded: Dimensions = {};

        for (var [kindName, power] of Object.entries(composition)) {
            const decomposed = orDie(this.#kindsExpanded.get(kindName), `Unknown kind: ${kindName}`);
            for (var [baseName, basePower] of Object.entries(decomposed)) {
                expanded[baseName] = (expanded[baseName] ?? 0) + basePower * power;
            }
        }
        cleanZeros(expanded);
        return expanded;
    }

    /**
     * @param name The kind of measurement, e.g. "length" or "force" or "acceleration"
     * @param composition undefined if base, or a map of constituent units to powers
     */
    addKind(
        name: string,
        composition?: Dimensions
    ) {
        if (!composition) {
            // Base kind
            this.#kinds.set(name, { [name]: 1 });
            this.#kindsExpanded.set(name, { [name]: 1 });
        } else {
            this.#kinds.set(name, composition);
            this.#kindsExpanded.set(name, this.expand(composition));
        }
    }

    /**
     * Define the base unit for a kind.
     * @param kind The name of the kind, must have been defined previously with {@link addKind}.
     */
    addBase(
        name: string,
        abbr: string,
        kind: string,
        aliases: string[] = []
    ) {
        orDie(this.#kinds.get(kind), `Unknown kind: ${kind}`);
        this.#registerUnit(new UnitDef(
            name,
            abbr,
            kind,
            1,
            0,
            aliases,
        ));
        this.#baseUnits.set(kind, name);
    }

    /**
     * Defines a new converted unit, based on a calculation from a different unit of the same kind
     * (The referenced other unit here doesn't have to be the base for the kind, the parameters will be converted
     * to be relative to the base if it isn't.)
     * 
     * valueInThisUnit = valueInReferenceUnit * perRef
     */
    addConversion(
        name: string,
        abbr: string,
        perRef: number,
        referenceUnitName: string,
        aliases: string[] = [],
    ) {
        this.addOffsetConversion(
            name,
            abbr,
            perRef,
            0,
            referenceUnitName,
            aliases
        );
    }

    /**
     * Defines a new non-affine converted unit, based on a calculation from a different unit of the same kind
     * (The referenced other unit here doesn't have to be the base for the kind, the parameters will be converted
     * to be relative to the base if it isn't.)
     *
     * valueInThisUnit = valueInReferencedUnit * perRef + zeroOffset
     */
    addOffsetConversion(
        name: string,
        abbr: string,
        perReference: number,
        zeroOffset: number,
        referenceUnitName: string,
        aliases: string[] = [],
    ) {
        const refUnit = orDie(this.#getUnit(referenceUnitName), `reference unit "${referenceUnitName}" not found`);
        // Conversion formula from base is always nonbase = base * slope + offset
        // unitA = unitB * APerB + offsetBToA
        // unitB = base * BPerBase + offsetBaseToB
        // thus
        // unitA = (base * BPerBase + offsetBaseToB) * APerB + offsetBToA
        // unitA = base * APerB * BPerBase + APerB * offsetBaseToB + offsetBToA
        this.#registerUnit(new UnitDef(
            name,
            abbr,
            refUnit.kind,
            refUnit.perBase * perReference,
            perReference * refUnit.zeroOffset + zeroOffset,
            aliases
        ));
    }

    #registerUnit(unit: UnitDef): void {
        this.#units.set(unit.name, unit);
        this.#units.set(unit.abbr, unit);
        for (var alias of unit.aliases) {
            this.#units.set(alias, unit);
        }
    }

    #getUnit(name: string): UnitDef | undefined {
        return this.#units.get(name);
    }

    #getUnitStrict(name: string): UnitDef {
        return orDie(this.#getUnit(name), `Unknown unit: ${name}`);
    }
    parse(value: number, unitName: string | UnitDef): Quantity {
        const unit = isString(unitName) ? this.parseUnit(unitName) : unitName;
        return new Quantity(unit.toBase(value), unit.kind);
    }

    parseUnit(name: string): UnitDef {
        const existing = this.#getUnit(name);
        if (existing) return existing;

        if (!/[*/\s^-]/.test(name)) return this.#getUnitStrict(name);

        return this.#parseCompoundUnit(name);
    }

    #parseCompoundUnit(expr: string): UnitDef {
        const original = expr.trim();
        var s = original.replace(/([a-zA-Z0-9])\s*-\s*(?=[a-zA-Z])/g, '$1*');

        const terms = s.split(/\s+/).filter(Boolean); // spaces = reset
        var slope = 1;
        const total: Dimensions = {};

        const nameParts: [UnitDef, number][] = [];

        for (var term of terms) {
            var sign = 1; // +1 = multiply, -1 = divide
            const tokens = term.match(/([a-zA-Z_]\w*(?:\^-?\d+(?:\.\d+)?)?)|([*/])/g) || [];

            for (var t of tokens) {
                if (t === "/") { sign = -1; continue; }
                if (t === "*") { continue; } // keep current sign

                const m = t.match(/^([a-zA-Z_]\w*)(?:\^(-?\d+(?:\.\d+)?))?$/);
                if (!m) throw new Error(`Invalid token "${t}"`);
                const [, name, expStr] = m;
                const unit = this.#getUnitStrict(name!);
                if (!unit.isAffine) throw new Error(`Affine unit ${stringify(name)} can't be used in compond expression`);
                const exp = expStr ? parseFloat(expStr) : 1;
                const eff = sign * exp;

                nameParts.push([unit, eff]);

                slope *= pow(unit.perBase, eff);
                const baseDims = this.#kindsExpanded.get(unit.kind)!;
                for (var [b, p] of Object.entries(baseDims)) {
                    total[b] = (total[b] ?? 0) + p * eff;
                }
            }
        }

        cleanZeros(total);
        if (isEmpty(total)) throw new Error(`${stringify(expr)} is dimensionless`);
        const kind = this.#findOrCreateKind(total)!;
        const existingUnit = this.#units.entries().filter(([, { kind: kind2, perBase: slope2 }]) => kind2 == kind && slope2 === slope).next();
        if (existingUnit.done) {
            const unit = new UnitDef(
                nameParts.map(formatLong).join(" "),
                nameParts.map(formatShort).join(""),
                kind,
                slope,
                0,
                [],
            );
            this.#registerUnit(unit);
            return unit;
        }
        return existingUnit.value![1];

    }

    add(
        a: Quantity | number,
        b: Quantity | number
    ) {
        const qa: Quantity = isNumber(a) ? new Quantity(a, null) : a;
        const qb: Quantity = isNumber(b) ? new Quantity(b, null) : b;
        if (qa.kind !== qb.kind) {
            throw new Error(
                `Cannot add incompatible kinds: ${qa.kind} and ${qb.kind}`
            );
        }
        return new Quantity(qa.value + qb.value, qa.kind);
    }
    sub(
        a: Quantity | number,
        b: Quantity | number
    ) {
        const qa: Quantity = isNumber(a) ? new Quantity(a, null) : a;
        const qb: Quantity = isNumber(b) ? new Quantity(b, null) : b;
        if (qa.kind !== qb.kind) {
            throw new Error(
                `Cannot subtract incompatible kinds: ${qa.kind} and ${qb.kind}`
            );
        }
        return new Quantity(qa.value - qb.value, qa.kind);
    }
    mul(
        a: Quantity | number,
        b: Quantity | number
    ) {
        const qa: Quantity = isNumber(a) ? new Quantity(a, null) : a;
        const qb: Quantity = isNumber(b) ? new Quantity(b, null) : b;
        return this.#multiplyKinds(qa.value * qb.value, qa.kind, qb.kind);

    }

    div(
        a: Quantity | number,
        b: Quantity | number
    ) {
        const qa: Quantity = isNumber(a) ? new Quantity(a, null) : a;
        const qb: Quantity = isNumber(b) ? new Quantity(b, null) : b;
        return this.#divideKinds(qa.value / qb.value, qa.kind, qb.kind);

    }

    pow(
        a: Quantity | number,
        b: number
    ) {
        const qa: Quantity = isNumber(a) ? new Quantity(a, null) : a;
        return new Quantity(pow(qa.value, b), this.#raiseKindToPower(qa.kind, b));
    }

    #multiplyKinds(
        product: number,
        kind1: string | null,
        kind2: string | null
    ): Quantity {
        if (kind1 === null) return new Quantity(product, kind2);
        if (kind2 === null) return new Quantity(product, kind1);

        const k1 = this.#kindsExpanded.get(kind1)!;
        const k2 = this.#kindsExpanded.get(kind2)!;
        const result: Dimensions = { ...k1 };

        for (var [base, power] of Object.entries(k2)) {
            result[base] = (result[base] ?? 0) + power;
        }

        return new Quantity(product, this.#findOrCreateKind(result));
    }

    #divideKinds(
        quotient: number,
        kind1: string | null,
        kind2: string | null
    ): Quantity {
        if (kind2 === null) return new Quantity(quotient, kind1)

        const k1 =
            kind1 === null
                ? {}
                : this.#kindsExpanded.get(kind1)!;
        const k2 = this.#kindsExpanded.get(kind2)!;
        const result: Dimensions = { ...k1 };

        for (var [base, power] of Object.entries(k2)) {
            result[base] = (result[base] ?? 0) - power;
        }

        return new Quantity(quotient, this.#findOrCreateKind(result));
    }

    #raiseKindToPower(kind: string | null, power: number): string | null {
        if (kind === null) return null;

        const k = this.#kindsExpanded.get(kind)!;
        const result: Dimensions = {};

        for (var [base, basePower] of Object.entries(k)) {
            result[base] = basePower * power;
        }

        return this.#findOrCreateKind(result);
    }

    #findOrCreateKind(dimensions: Dimensions): string | null {
        dimensions = this.expand(dimensions);
        cleanZeros(dimensions);
        // reuse existing
        for (var [name, dim] of this.#kindsExpanded) {
            if (this.#dimensionsEqual(dim, dimensions)) return name;
        }

        // build readable name: a*b^-1*c^2
        const parts: [string, number][] = Object.entries(dimensions).sort(([a], [b]) => a.localeCompare(b));
        const syntheticName = parts.map(([base, p]) => p === 1 ? base : `${base}^${p}`).join("*");

        if (!syntheticName) return null;

        // register the kind
        this.addKind(syntheticName, dimensions);

        // create its base unit (toBase = 1)
        if (!this.#baseUnits.has(syntheticName)) {
            const unitParts = parts.map(part => [this.#units.get(this.#baseUnits.get(part[0])!)!, part[1]] as const);
            this.addBase(
                unitParts.map(formatLong).join(" "),
                unitParts.map(formatShort).join(""),
                syntheticName,
            );
        }
        return syntheticName;
    }

    #dimensionsEqual(
        a: Dimensions,
        b: Dimensions
    ): boolean {
        const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
        for (var key of keys) {
            if ((a[key] ?? 0) !== (b[key] ?? 0)) return false;
        }
        return true;
    }

    convert(qty: Quantity, toUnitName: string | UnitDef): number {
        const toUnit = isString(toUnitName) ? this.parseUnit(toUnitName) : toUnitName;
        if (toUnit.kind !== qty.kind) {
            throw new Error(`Cannot convert ${qty.kind} to ${toUnit.kind}`);
        }
        // qty.value is already in base dimensions
        return toUnit.fromBase(qty.value);
    }

    /**
     * @param fullName if true (default), use the full formal name of the unit ("meters", "seconds"), if false, use the abbreviation ("m", "s")
     */
    format(
        qty: Quantity,
        unit: string,
        fullName?: boolean,
    ): string;
    /**
     * Format the unit as a compound unit instead of a decimal (e.g. "10 hours 30 minutes" instead of "10.5 hours")
     * @param fullName if true (default), use the full formal name of the unit ("minutes", "seconds"), if false, use the abbreviation ("min", "s")
     */
    format(
        qty: Quantity,
        units: string[],
        fullName?: boolean,
    ): string;
    /**
     * Given the list of units, format the value using the largest unit that won't produce a decimal starting with 0.
     * For example, given 1241 meters and options of meters and kilometers, this will return "1.241 kilometers",
     * but 941 meters will stay "941 meters".
     * @param fullName if true (default), use the full formal name of the unit ("minutes", "seconds"), if false, use the abbreviation ("min", "s")
     */
    format(
        qty: Quantity,
        units: string[],
        fullName: boolean,
        best: true,
    ): string;
    format(
        qty: Quantity,
        units: string | string[],
        fullName: boolean = true,
        best: boolean = false,
    ): string {

        const formatHelper = (value: number, unit: UnitDef) => {
            const unitStr = fullName ? unit.name : unit.abbr;
            return `${value} ${unitStr}`;
        }
        if (isString(units)) {
            const unit = this.parseUnit(units);
            const value = this.convert(qty, unit);
            return formatHelper(value, unit);
        }
        // else we have multiple units
        if (units.length === 0) {
            throw new Error("Must provide at least one unit");
        }
        const unitUnits = units.map(unit => this.parseUnit(unit));

        // Verify all are not affine units
        for (var unit of unitUnits) {
            if (!unit.isAffine) throw new Error(`Non-affine unit ${stringify(unit.name)} can't be used in compond expression`);
        }

        // Verify all units are the same kind
        const kinds = unitUnits.map(unit => unit.kind);
        if (new Set(kinds).size > 1) {
            throw new Error(`Compound unit units must all be the same kind. Got: ${unitUnits.map(unit => `${unit.kind} (${unit.abbr})`).join(", ")}`);
        }

        // Sort the units from largest magnitude first to smallest magnitude
        const sortedUnits = unitUnits.toSorted((a, b) => log(a.perBase / b.perBase));

        // Convert to each unit and build the string
        const partsByUnit: Record<string, string> = {};

        // Convert number to smallest unit to start with so we can do integer math
        const lastUnit = sortedUnits.at(-1)!;
        const fullMultiplier = 1 / lastUnit.perBase;
        var full = this.convert(qty, lastUnit);

        // If "best", just find the one that makes it not 0.xxx
        if (best) {
            for (var unit of sortedUnits) {
                const inUnit = this.convert(qty, unit);
                if (abs(inUnit) > 1) {
                    return formatHelper(inUnit, unit);
                }
            }
        }

        for (var unit of sortedUnits) {
            const inUnit = full * fullMultiplier * unit.perBase;
            const intInUnit = unit === lastUnit ? inUnit : Math.floor(inUnit);
            if (intInUnit > 0) {
                partsByUnit[unit.name] = formatHelper(intInUnit, unit);
                full -= intInUnit / unit.perBase / fullMultiplier;
            }
        }

        return unitUnits.flatMap(unit => partsByUnit[unit.name] ? [partsByUnit[unit.name]] : []).join(" ");
    }
}

function orDie<T>(value: T | undefined | null, message: string): T {
    if (undefinedToNull(value) === null) {
        throw new Error(message);
    }
    return value!;
}

function formatLong([unit, p]: readonly [UnitDef, number]) {
    return p === 1 ? unit.name : `${unit.name}^${p}`;
}

function formatShort([unit, p]: readonly [UnitDef, number], i: number) {
    return (p < 0 ? "/" : (i > 0 ? "*" : "")) + (abs(p) === 1 ? unit.abbr : `${unit.abbr}^${abs(p)}`);
}

function cleanZeros(dimensions: Dimensions) {
    for (var key of keys(dimensions)) {
        if (dimensions[key] === 0) delete dimensions[key];
    }
}

export * from "./data";

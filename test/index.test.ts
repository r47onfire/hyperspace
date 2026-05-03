import { beforeEach, describe, expect, test } from "bun:test";
import { UnitSystem, dataUnits, physicsUnits, basicUnits } from "../src";


function makeBasic(): UnitSystem {
    const U = new UnitSystem();
    basicUnits(U);
    physicsUnits(U);
    dataUnits(U);
    U.addKind("a");
    U.addKind("b");
    U.addKind("c");
    U.addKind("d");
    U.addBase("a", "a", "a");
    U.addBase("b", "b", "b");
    U.addBase("c", "c", "c");
    U.addBase("d", "d", "d");
    return U;
}

var U = makeBasic();
beforeEach(() => U = makeBasic());

// console.log(Object.fromEntries(U.kinds.map(kind => [kind, U.expand(kind)])))

describe("basics", () => {
    test("simple parse", () => {
        const q = U.parse(5, "m");
        expect(q.value).toBe(5);
        expect(q.kind).toBe("length");
    });

    test("converted unit", () => {
        const q = U.parse(2, "km");
        expect(q.value).toBe(2000); // in base meters
    });
});

describe("compound parsing", () => {
    test("a/b", () => {
        const q = U.parse(10, "a/b");
        const dims = U.expand(q.kind);
        expect(dims).toEqual({ a: 1, b: -1 });
    });

    test("a b c = implicit multiply", () => {
        const q = U.parse(1, "a b c");
        const dims = U.expand(q.kind);
        expect(dims).toEqual({ a: 1, b: 1, c: 1 });
    });

    test("a b^-2", () => {
        const q = U.parse(1, "a b^-2");
        const dims = U.expand(q.kind)
        expect(dims).toEqual({ a: 1, b: -2 });
    });

    test("a*b and a-b are same", () => {
        const q1 = U.parse(1, "a*b");
        const q2 = U.parse(1, "a-b");
        expect(q1.kind).toBe(q2.kind);
    });

    test("a/b^2", () => {
        const q = U.parse(1, "a/b^2");
        const dims = U.expand(q.kind);
        expect(dims).toEqual({ a: 1, b: -2 });
    });

    describe("space-reset semantics", () => {
        test("a/b*c d -> b and c stay in denominator, d resets", () => {
            const q = U.parse(1, "a/b*c d");
            const dims = U.expand(q.kind);
            expect(dims).toEqual({ a: 1, b: -1, c: -1, d: 1 });
        });

        test("a/b*c*d -> * does NOT reset", () => {
            const q = U.parse(1, "a/b*c*d");
            const dims = U.expand(q.kind);
            expect(dims).toEqual({ a: 1, b: -1, c: -1, d: -1 });
        });

        test("space creates new numerator group", () => {
            const q1 = U.parse(1, "a/b c");
            const q2 = U.parse(1, "a*c/b");
            expect(q1.kind).toBe(q2.kind);
        });
    });
});

describe("conversion", () => {
    test("km to m", () => {
        const q = U.parse(1.5, "km");
        expect(U.convert(q, "m")).toBeCloseTo(1500);
    });

    test("compound convert m/s to km/h", () => {
        const q = U.parse(10, "m/s");
        const kmh = U.convert(q, "km/h");
        expect(kmh).toBeCloseTo(36);
    });

    test("same dimensions different order", () => {
        const q = U.parse(5, "a/b*c d");
        expect(U.convert(q, "a*d/b/c")).toBe(5);
    });

    test("incompatible kinds throw", () => {
        const q = U.parse(1, "m");
        expect(() => U.convert(q, "s")).toThrow("Cannot convert length to time");
    });
});

describe("formatting", () => {
    test("simple format", () => {
        const q = U.parse(3, "km");
        expect(U.format(q, "m")).toBe("3000 meters");
        expect(U.format(q, "km", false)).toBe("3 km");
    });

    test("compound format keeps expression", () => {
        const q = U.parse(2, "m/s");
        expect(U.format(q, "m/s", false)).toBe("2 m/s");
    });

    describe("compound", () => {
        test("full names", () => {
            const q = U.parse(3661, "s"); // 1h 1min 1s
            const out = U.format(q, ["h", "min", "s"]);
            expect(out).toBe("1 hours 1 minutes 1 seconds");
        });

        test("abbreviations", () => {
            const q = U.parse(3661, "s");
            const out = U.format(q, ["h", "min", "s"], false);
            expect(out).toBe("1 h 1 min 1 s");
        });

        test("skips zero parts", () => {
            const q = U.parse(90, "s"); // 1min 30s
            expect(U.format(q, ["h", "min", "s"])).toBe("1 minutes 30 seconds");
        });

        test("km + m", () => {
            const q = U.parse(1500, "m");
            expect(U.format(q, ["km", "m"])).toBe("1 kilometers 500 meters");
        });
    });
    describe("best", () => {
        test("picks largest unit > 1 (full name)", () => {
            const q = U.parse(7200, "s"); // 2h
            const out = U.format(q, ["h", "min", "s"], true, true);
            expect(out).toBe("2 hours");
        });

        test("picks minute for 90s", () => {
            const q = U.parse(90, "s");
            const out = U.format(q, ["h", "min", "s"], true, true);
            expect(out).toBe("1.5 minutes");
        });

        test("abbreviations", () => {
            const q = U.parse(90, "s");
            const out = U.format(q, ["h", "min", "s"], false, true);
            expect(out).toBe("1.5 min");
        });

        test("falls back when all < 1", () => {
            const q = U.parse(30, "s"); // 0.5 min, 0.0083 h
            const out = U.format(q, ["h", "min"], true, true);
            // no unit >1, so it does normal breakdown on smallest unit
            expect(out).toBe("0.5 minutes");
        });

        test("works with different magnitudes", () => {
            const q = U.parse(1500, "m");
            const out = U.format(q, ["km", "m"], true, true);
            expect(out).toBe("1.5 kilometers");
        });
    });

    test("array mixed kinds throws", () => {
        const q = U.parse(10, "s");
        expect(() => U.format(q, ["h", "m"])).toThrow(/same kind/);
    });

    test("array works with compound units too", () => {
        const q = U.parse(36, "km/h");
        const out = U.format(q, ["km/h", "m/s"], false, true);
        // 10 m/s = 36 km/h -> picks m/s because it's the "larger" unit
        expect(out).toBe("10 m/s");
    });
});

describe("math", () => {
    test("multiply creates new kind", () => {
        const a = U.parse(2, "m");
        const b = U.parse(3, "s");
        const c = U.mul(a, b);
        const dims = U.expand(c.kind);
        expect(c.value).toBe(6);
        expect(dims).toEqual({ length: 1, time: 1 });
    });

    test("divide", () => {
        const a = U.parse(10, "m");
        const b = U.parse(2, "s");
        const c = U.div(a, b);
        expect(c.value).toBe(5);
    });

    test("add/subtract require same dimensions", () => {
        expect(() => U.add(U.parse(1, "m"), U.parse(1, "s"))).toThrow("Cannot add incompatible kinds: length and time");
        expect(() => U.sub(U.parse(1, "m"), U.parse(1, "s"))).toThrow("Cannot subtract incompatible kinds: length and time");
    });

    test("resonant frequency test", () => {
        const L = U.parse(1e-6, "H"); // 1 microhenry
        const C = U.parse(1e-6, "F"); // 1 microfarad
        // resonant frequency = 1/sqrt(L*C) = 1e+6 radians per second
        const omega0 = U.pow(U.mul(L, C), -0.5);
        expect(omega0.value).toBeCloseTo(1e6);
    });
});

describe("caching and kind creation", () => {
    test("findOrCreateKind registers base unit", () => {
        const q = U.parse(1, "a/b");
        expect(U.baseFor(q.kind!)).toEqual("a b^-1");
    });

    test("resolveUnit caches compound", () => {
        const u1 = U.parseUnit("a/b*c");
        const u2 = U.parseUnit("a/b*c");
        expect(u1).toBe(u2);
    });

    test("dimensionless", () => {
        expect(() => U.parse(1, "A/A")).toThrow("\"A/A\" is dimensionless");
    });
});


describe("non-affine units", () => {
    test("temperature conversion", () => {
        expect(U.convert(U.parse(0, "kelvin"), "celsius")).toBe(-273.15);
        const FtoC = (value: number) => U.convert(U.parse(value, "fahrenheit"), "celsius");
        expect(FtoC(32)).toBe(0);
        expect(FtoC(212)).toBe(100);
        expect(FtoC(-40)).toBe(-40);
    });
});

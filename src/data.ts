import { Dimensions, UnitSystem } from ".";

export function basicUnits(system: UnitSystem, pixelsPerMeter = 64) {
    // base kinds
    system.addKind("length");
    system.addKind("time");
    system.addKind("mass");
    system.addKind("temperature");

    // derived
    system.addKind("frequency", { time: -1 });
    system.addKind("area", { length: 2 });
    system.addKind("volume", { length: 3 });
    system.addKind("velocity", { length: 1, time: -1 });
    system.addKind("acceleration", { length: 1, time: -2 });

    // lengths
    system.addBase("meters", "m", "length", ["metres"]);
    system.addConversion("pixels", "px", pixelsPerMeter, "m");
    system.addConversion("centimeters", "cm", 100, "m");
    system.addConversion("inches", "in", 1 / 2.54, "cm");
    system.addConversion("feet", "ft", 1 / 12, "in");
    system.addConversion("kilometers", "km", .001, "m");

    // time
    system.addBase("seconds", "s", "time", ["sec"]);
    system.addConversion("milliseconds", "ms", .001, "s");
    system.addConversion("minutes", "min", 1 / 60, "s");
    system.addConversion("hours", "h", 1 / 60, "min", ["hr"]);
    system.addBase("hertz", "Hz", "frequency");

    // mass
    system.addBase("kilograms", "kg", "mass");
    system.addConversion("grams", "g", 1000, "kg");

    // temperature
    system.addBase("kelvin", "°K", "temperature", ["K"]);
    system.addOffsetConversion("celsius", "°C", 1, -273.15, "kelvin", ["℃"]);
    system.addOffsetConversion("fahrenheit", "°F", 1.8, 32, "celsius", ["℉"]);
}

export function physicsUnits(system: UnitSystem) {
    const data: [string, string, string, dims: Dimensions | undefined, aliases?: string[]][] = [
        ["amperes", "A", "current", undefined, ["amps"]],
        ["newtons", "N", "force", { mass: 1, acceleration: 1 }],
        ["pascals", "Pa", "pressure", { force: 1, area: -1 }],
        ["joules", "J", "energy", { force: 1, length: 1 }],
        ["watts", "W", "power", { energy: 1, time: -1 }],
        ["coulombs", "C", "charge", { current: 1, time: 1 }],
        ["volts", "V", "voltage", { energy: 1, charge: -1 }],
        ["ohms", "Ω", "resistance", { voltage: 1, current: -1 }],
        ["farads", "F", "capacitance", { charge: 1, voltage: -1 }],
        ["webers", "Wb", "flux", { voltage: 1, time: -1 }],
        ["henries", "H", "inductance", { flux: 1, current: -1 }],
        ["teslas", "T", "magnetism", { flux: 1, area: -1 }],
    ]

    for (var [name, abbr, kind, composition, aliases] of data) {
        system.addKind(kind, composition);
        system.addBase(name, abbr, kind, aliases ?? []);
    }
}

export function dataUnits(system: UnitSystem) {
    system.addKind("data");
    system.addBase("bytes", "B", "data");
    system.addConversion("bits", "b", 1 / 8, "bytes");

    system.addConversion("kilobytes", "KB", .001, "B");
    system.addConversion("megabytes", "MB", .001, "KB");
    system.addConversion("gigabytes", "GB", .001, "MB");
    system.addConversion("terabytes", "TB", .001, "GB");

    system.addConversion("kibibytes", "KiB", 1 / 1024, "bytes"); // cSpell: ignore kibibytes
    system.addConversion("mebibytes", "MiB", 1 / 1024, "KiB"); // cSpell: ignore mebibytes
    system.addConversion("gibibytes", "GiB", 1 / 1024, "MiB"); // cSpell: ignore gibibytes
    system.addConversion("tebibytes", "TiB", 1 / 1024, "GiB"); // cSpell: ignore tebibytes

    system.addKind("bitrate", { data: 1, time: -1 });
}

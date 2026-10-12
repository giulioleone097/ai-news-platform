/**
 * One class per port keeps each adapter small; the apps still take a single object that has all the ports'
 * members. A part names the members of its port as a `Record<keyof Port, true>`, which the compiler checks both
 * ways: a member the port gains must be listed, and only members can be. Methods are bound to their part.
 */
export interface PortPart<Port extends object> {
  readonly part: Port;
  readonly members: readonly string[];
}

export function portPart<Port extends object>(part: Port, members: Record<keyof Port, true>): PortPart<Port> {
  return { part, members: Object.keys(members) };
}

type Intersection<Union> = (Union extends unknown ? (value: Union) => void : never) extends (value: infer All) => void
  ? All
  : never;

export function composePorts<Ports extends object[]>(
  ...parts: { [Index in keyof Ports]: PortPart<Ports[Index]> }
): Intersection<Ports[number]> {
  const composed: Record<string, unknown> = {};
  for (const { part, members } of parts as PortPart<object>[]) {
    const source = part as Record<string, unknown>;
    for (const name of members) {
      if (name in composed) throw new Error(`Two ports define ${name}`);
      const member = source[name];
      if (typeof member === "function") composed[name] = member.bind(part);
      else Object.defineProperty(composed, name, { enumerable: true, get: () => source[name] });
    }
  }
  return composed as Intersection<Ports[number]>;
}

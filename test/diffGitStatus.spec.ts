import { mapChangeTypeToStatus, mergeStatus } from "../src/git/diffGitStatus";

describe("mapChangeTypeToStatus", () => {
  it("maps add to added", () =>
    expect(mapChangeTypeToStatus("add")).toBe("added"));
  it("maps delete to deleted", () =>
    expect(mapChangeTypeToStatus("delete")).toBe("deleted"));
  it("maps rename to renamed", () =>
    expect(mapChangeTypeToStatus("rename")).toBe("renamed"));
  it("maps copy to copied", () =>
    expect(mapChangeTypeToStatus("copy")).toBe("copied"));
  it("maps type-change to type-changed", () =>
    expect(mapChangeTypeToStatus("type-change")).toBe("type-changed"));
  it("maps modify to modified", () =>
    expect(mapChangeTypeToStatus("modify")).toBe("modified"));
});

describe("mergeStatus", () => {
  it("returns same status when both are equal", () => {
    expect(mergeStatus("modified", "modified")).toBe("modified");
    expect(mergeStatus("deleted", "deleted")).toBe("deleted");
  });

  it("deleted beats added", () => {
    expect(mergeStatus("deleted", "added")).toBe("deleted");
    expect(mergeStatus("added", "deleted")).toBe("deleted");
  });

  it("added beats renamed", () => {
    expect(mergeStatus("added", "renamed")).toBe("added");
    expect(mergeStatus("renamed", "added")).toBe("added");
  });

  it("renamed beats copied", () => {
    expect(mergeStatus("renamed", "copied")).toBe("renamed");
    expect(mergeStatus("copied", "renamed")).toBe("renamed");
  });

  it("copied beats type-changed", () => {
    expect(mergeStatus("copied", "type-changed")).toBe("copied");
    expect(mergeStatus("type-changed", "copied")).toBe("copied");
  });

  it("modified beats unknown", () => {
    expect(mergeStatus("modified", "unknown")).toBe("modified");
    expect(mergeStatus("unknown", "modified")).toBe("modified");
  });

  it("deleted beats modified", () => {
    expect(mergeStatus("modified", "deleted")).toBe("deleted");
    expect(mergeStatus("deleted", "modified")).toBe("deleted");
  });
});

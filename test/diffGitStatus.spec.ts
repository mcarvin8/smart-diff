import { mapGitStatus, mergeStatus } from "../src/git/diffGitStatus";

describe("mapGitStatus", () => {
  it("maps A to added", () => expect(mapGitStatus("A")).toBe("added"));
  it("maps D to deleted", () => expect(mapGitStatus("D")).toBe("deleted"));
  it("maps R to renamed", () => expect(mapGitStatus("R")).toBe("renamed"));
  it("maps R100 to renamed", () =>
    expect(mapGitStatus("R100")).toBe("renamed"));
  it("maps C to copied", () => expect(mapGitStatus("C")).toBe("copied"));
  it("maps T to type-changed", () =>
    expect(mapGitStatus("T")).toBe("type-changed"));
  it("maps M to modified", () => expect(mapGitStatus("M")).toBe("modified"));
  it("maps unknown code to unknown", () =>
    expect(mapGitStatus("X")).toBe("unknown"));
  it("maps empty string to unknown", () =>
    expect(mapGitStatus("")).toBe("unknown"));
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

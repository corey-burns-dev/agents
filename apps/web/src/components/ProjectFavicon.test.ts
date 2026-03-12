import { describe, expect, it } from "vitest";
import { getProjectAvatarInitials } from "./ProjectFavicon";

describe("ProjectFavicon", () => {
  it("uses the first two alphanumeric characters from the project name", () => {
    expect(getProjectAvatarInitials("Agents")).toBe("AG");
    expect(getProjectAvatarInitials("My Project")).toBe("MY");
    expect(getProjectAvatarInitials("9 Lives")).toBe("9L");
  });

  it("falls back to placeholder initials when no usable characters exist", () => {
    expect(getProjectAvatarInitials("  - _ ")).toBe("??");
  });
});

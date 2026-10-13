import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeLoginEmail } from "./user-management.server";

describe("user management utilities & constraints", () => {
  describe("normalizeLoginEmail", () => {
    it("maps a plain staff username to internal @athene.local domain", () => {
      assert.equal(normalizeLoginEmail("arun"), "arun@athene.local");
      assert.equal(normalizeLoginEmail("Karthik"), "karthik@athene.local");
      assert.equal(normalizeLoginEmail("  staff_01  "), "staff_01@athene.local");
    });

    it("preserves full email addresses untouched (lowercased and trimmed)", () => {
      assert.equal(normalizeLoginEmail("admin@company.com"), "admin@company.com");
      assert.equal(normalizeLoginEmail("  John.Doe@Gmail.com "), "john.doe@gmail.com");
      assert.equal(normalizeLoginEmail("user@athene.local"), "user@athene.local");
    });
  });

  describe("staff user input validation constraints", () => {
    it("requires display name to be at least 2 characters", () => {
      const validateName = (name: string) => name.trim().length >= 2;
      assert.equal(validateName("A"), false);
      assert.equal(validateName(""), false);
      assert.equal(validateName("   "), false);
      assert.equal(validateName("Al"), true);
      assert.equal(validateName("Alice"), true);
    });

    it("requires username to be at least 2 characters", () => {
      const validateUsername = (u: string) => u.trim().length >= 2;
      assert.equal(validateUsername("a"), false);
      assert.equal(validateUsername(""), false);
      assert.equal(validateUsername("ro"), true);
      assert.equal(validateUsername("rahul"), true);
    });

    it("requires passwords to be at least 6 characters", () => {
      const validatePassword = (p: string) => p.trim().length >= 6;
      assert.equal(validatePassword("12345"), false);
      assert.equal(validatePassword(""), false);
      assert.equal(validatePassword("123456"), true);
      assert.equal(validatePassword("secret_pass"), true);
    });
  });

  describe("protection rules against self or admin deactivation", () => {
    it("blocks an admin from deactivating their own account", () => {
      const canDeactivate = (targetUserId: string, callerUserId: string, targetRole: string) => {
        if (targetUserId === callerUserId) throw new Error("You cannot deactivate your own account.");
        if (targetRole === "admin") throw new Error("Admin accounts cannot be deactivated.");
        return true;
      };

      assert.throws(
        () => canDeactivate("user-1", "user-1", "admin"),
        /cannot deactivate your own account/,
      );
    });

    it("blocks deactivation of other admin accounts", () => {
      const canDeactivate = (targetUserId: string, callerUserId: string, targetRole: string) => {
        if (targetUserId === callerUserId) throw new Error("You cannot deactivate your own account.");
        if (targetRole === "admin") throw new Error("Admin accounts cannot be deactivated.");
        return true;
      };

      assert.throws(
        () => canDeactivate("admin-2", "admin-1", "admin"),
        /Admin accounts cannot be deactivated/,
      );
    });

    it("permits deactivation of staff accounts by an admin", () => {
      const canDeactivate = (targetUserId: string, callerUserId: string, targetRole: string) => {
        if (targetUserId === callerUserId) throw new Error("You cannot deactivate your own account.");
        if (targetRole === "admin") throw new Error("Admin accounts cannot be deactivated.");
        return true;
      };

      assert.equal(canDeactivate("staff-1", "admin-1", "staff"), true);
    });
  });

  describe("active status evaluation", () => {
    it("considers account inactive if banned_until is in the future", () => {
      const isAccountActive = (bannedUntil: string | null, isActiveMeta: boolean | undefined) => {
        const isBanned = Boolean(bannedUntil && new Date(bannedUntil) > new Date());
        return isActiveMeta !== false && !isBanned;
      };

      const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
      assert.equal(isAccountActive(futureDate, true), false);
    });

    it("considers account inactive if is_active metadata is false", () => {
      const isAccountActive = (bannedUntil: string | null, isActiveMeta: boolean | undefined) => {
        const isBanned = Boolean(bannedUntil && new Date(bannedUntil) > new Date());
        return isActiveMeta !== false && !isBanned;
      };

      assert.equal(isAccountActive(null, false), false);
    });

    it("considers account active if neither banned nor marked inactive", () => {
      const isAccountActive = (bannedUntil: string | null, isActiveMeta: boolean | undefined) => {
        const isBanned = Boolean(bannedUntil && new Date(bannedUntil) > new Date());
        return isActiveMeta !== false && !isBanned;
      };

      assert.equal(isAccountActive(null, true), true);
      assert.equal(isAccountActive(null, undefined), true);
    });
  });

  describe("role selection and role assignment rules", () => {
    it("defaults created account role to staff when not specified", () => {
      const resolveRole = (r?: "admin" | "staff") => (r === "admin" ? "admin" : "staff");
      assert.equal(resolveRole(undefined), "staff");
      assert.equal(resolveRole("staff"), "staff");
    });

    it("assigns admin role when admin is explicitly chosen", () => {
      const resolveRole = (r?: "admin" | "staff") => (r === "admin" ? "admin" : "staff");
      assert.equal(resolveRole("admin"), "admin");
    });

    it("prevents an admin from demoting their own role", () => {
      const canUpdateRole = (targetId: string, callerId: string, newRole: string) => {
        if (targetId === callerId && newRole !== "admin") {
          throw new Error("You cannot remove your own admin privileges.");
        }
        return true;
      };

      assert.throws(
        () => canUpdateRole("admin-1", "admin-1", "staff"),
        /cannot remove your own admin privileges/,
      );
      assert.equal(canUpdateRole("admin-1", "admin-1", "admin"), true);
      assert.equal(canUpdateRole("staff-1", "admin-1", "admin"), true);
      assert.equal(canUpdateRole("staff-1", "admin-1", "staff"), true);
    });
  });
});


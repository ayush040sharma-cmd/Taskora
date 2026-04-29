const { z } = require("zod");

/**
 * Express middleware factory.
 * Usage: router.post("/", validate(mySchema), handler)
 * Validates req.body against the schema; returns 400 with field errors on failure.
 */
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = (result.error.issues ?? result.error.errors ?? []).map(e => ({
        field:   e.path.join("."),
        message: e.message,
      }));
      return res.status(400).json({ message: "Validation failed", errors });
    }
    req.body = result.data; // replace with coerced/stripped data
    next();
  };
}

// ── Auth schemas ──────────────────────────────────────────────────────────────
const registerSchema = z.object({
  name:     z.string().min(2, "Name must be at least 2 characters").max(80).trim(),
  email:    z.string().email("Invalid email address").toLowerCase().trim(),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  role:     z.enum(["manager", "member"]).optional().default("manager"),
});

const loginSchema = z.object({
  email:    z.string().email("Invalid email address").trim(),
  password: z.string().min(1, "Password is required"),
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address").toLowerCase().trim(),
});

const resetPasswordSchema = z.object({
  token:    z.string().min(1, "Reset token is required"),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1, "Current password is required"),
  new_password:     z.string()
    .min(8, "New password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain at least one uppercase letter")
    .regex(/[0-9]/, "Must contain at least one number"),
});

// ── Task schemas ──────────────────────────────────────────────────────────────
const TASK_STATUSES   = ["todo", "inprogress", "in_progress", "review", "done", "pending_approval"];
const TASK_PRIORITIES = ["low", "medium", "high"];
const TASK_TYPES      = ["task", "bug", "story", "upgrade", "rfp", "proposal", "presentation", "poc", "normal"];

const createTaskSchema = z.object({
  title:          z.string().min(1, "Title is required").max(255).trim(),
  workspace_id:   z.number({ required_error: "workspace_id is required" }).int().positive(),
  status:         z.enum(TASK_STATUSES).optional().default("todo"),
  priority:       z.enum(TASK_PRIORITIES).optional().default("medium"),
  type:           z.enum(TASK_TYPES).optional().default("task"),
  description:    z.string().max(5000).optional(),
  estimated_hours:z.number().min(0).max(9999).optional(),
  due_date:       z.string().optional().nullable(),
  assigned_user_id: z.number().int().positive().optional().nullable(),
  sprint_id:      z.number().int().positive().optional().nullable(),
  position:       z.number().int().min(0).optional(),
});

const updateTaskSchema = createTaskSchema.partial().omit({ workspace_id: true });

// ── Member schemas ────────────────────────────────────────────────────────────
const addMemberSchema = z.object({
  workspace_id: z.number().int().positive(),
  email:        z.string().email("Invalid email address").toLowerCase().trim(),
  role:         z.enum(["manager", "member", "viewer"]).optional().default("member"),
});

const updateMemberRoleSchema = z.object({
  role:         z.enum(["manager", "member", "viewer"]),
  workspace_id: z.number().int().positive(),
});

// ── Workspace schemas ─────────────────────────────────────────────────────────
const createWorkspaceSchema = z.object({
  name: z.string().min(2, "Workspace name must be at least 2 characters").max(100).trim(),
});

// ── Comment schema ────────────────────────────────────────────────────────────
const addCommentSchema = z.object({
  content: z.string().min(1, "Comment cannot be empty").max(2000).trim(),
});

module.exports = {
  validate,
  schemas: {
    register:           registerSchema,
    login:              loginSchema,
    forgotPassword:     forgotPasswordSchema,
    resetPassword:      resetPasswordSchema,
    changePassword:     changePasswordSchema,
    createTask:         createTaskSchema,
    updateTask:         updateTaskSchema,
    addMember:          addMemberSchema,
    updateMemberRole:   updateMemberRoleSchema,
    createWorkspace:    createWorkspaceSchema,
    addComment:         addCommentSchema,
  },
};

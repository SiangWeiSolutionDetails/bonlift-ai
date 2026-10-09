import Type from "typebox";

// No leading/trailing whitespace, so "Thai Express " cannot slip past the case-insensitive
// unique indexes as a different name. Mirrored by the *_name_check constraints in the migrations.
export const NAME_PATTERN = "^\\S(?:.*\\S)?$";

export const NameSchema = Type.String({
  minLength: 1,
  maxLength: 255,
  pattern: NAME_PATTERN,
});

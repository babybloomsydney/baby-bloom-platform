/**
 * Shared shape for transactional email template builder return values.
 * Lets the route layer pass a uniform `{ subject, html }` to `sendEmail`
 * regardless of which template produced it.
 */
export type EmailTemplate = {
  subject: string;
  html: string;
};

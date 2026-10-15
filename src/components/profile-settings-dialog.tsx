import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { careApi } from "@/api/care";
import { api } from "@/api/client";
import type { AuthUser } from "@/components/auth/login-page";
import { CalendarLink } from "@/components/calendar-link";
import { FamilyAvatar } from "@/components/family-avatar";
import { PhoneInput } from "@/components/phone-input";
import { TelegramLink } from "@/components/telegram-link";
import { Button } from "@/components/ui/button";
import { fileToAvatarDataUrl } from "@/lib/image";
import { availabilityOptions, type Availability, type FamilyMember } from "@/types/care";

// Keep in step with MIN_PASSWORD_LENGTH in backend/app/schemas/auth.py.
const minPasswordLength = 12;

/** Match the backend's phone normalization so "+65 9123 4567" equals the stored "+6591234567". */
function normalizePhone(value: string) {
  return value.replace(/[\s().-]/g, "") || null;
}

const fieldClassName = "mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-ring";

export function ProfileSettingsDialog({
  currentUser,
  member,
  onSaved,
  onClose,
}: {
  currentUser: AuthUser;
  /** The user's entry in their family, which holds their role and availability. */
  member?: FamilyMember;
  onSaved: (user: AuthUser) => Promise<void> | void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(currentUser.name);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(currentUser.avatar_url);
  const [role, setRole] = useState(member?.relationshipLabel ?? "");
  const [availability, setAvailability] = useState<Availability>(member?.availability ?? "Available");
  const [availabilityNote, setAvailabilityNote] = useState(member?.availabilityNote ?? "");
  const [email, setEmail] = useState(currentUser.email);
  const [phone, setPhone] = useState(currentUser.phone ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirmation, setNewPasswordConfirmation] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const choosePicture = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Allow picking the same file again after removing it.
    event.target.value = "";
    if (!file) return;
    setErrorMessage("");
    try {
      setAvatarUrl(await fileToAvatarDataUrl(file));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "That image could not be used.");
    }
  };

  const emailChanged = email.trim().toLowerCase() !== currentUser.email;
  const phoneChanged = normalizePhone(phone) !== currentUser.phone;
  // Changing how you sign in is confirmed with the current password.
  const needsCurrentPassword = emailChanged || phoneChanged || newPassword.length > 0;

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    if (newPassword !== newPasswordConfirmation) {
      setErrorMessage("The new passwords do not match.");
      return;
    }
    setIsSaving(true);
    try {
      // Sign-in changes go first: if the current password is wrong, nothing else is saved.
      if (emailChanged || phoneChanged) {
        await api<AuthUser>("/auth/me/sign-in-details", {
          method: "PATCH",
          body: {
            current_password: currentPassword,
            ...(emailChanged && { email: email.trim() }),
            ...(phoneChanged && { phone: normalizePhone(phone) }),
          },
        });
      }
      if (newPassword) {
        await api("/auth/change-password", { method: "POST", body: { current_password: currentPassword, new_password: newPassword } });
      }
      const user = await api<AuthUser>("/auth/me", {
        method: "PATCH",
        // Only send the picture when it changed, so an unchanged one is not uploaded again.
        body: { name: name.trim(), ...(avatarUrl !== currentUser.avatar_url && { avatar_url: avatarUrl }) },
      });
      if (member) {
        await careApi.updateMember(user.id, {
          relationshipLabel: role.trim() || null,
          availability,
          availabilityNote: availabilityNote.trim() || null,
        });
      }
      await onSaved(user);
      dialogRef.current?.close();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Your profile could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  const initials = name.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "?";

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="profile-settings-title"
      onClose={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}
      className="fixed inset-0 m-auto max-h-[calc(100%-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-foreground/35"
    >
      <form onSubmit={save} className="p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="profile-settings-title" className="font-display text-2xl font-semibold">Profile settings</h2>
            <p className="mt-1 text-sm text-muted-foreground">{currentUser.email}</p>
          </div>
          <button type="button" aria-label="Close profile settings" onClick={() => dialogRef.current?.close()} className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className="mt-6 flex items-center gap-4">
          <FamilyAvatar initials={initials} tone={member?.tone} imageUrl={avatarUrl} className="size-20 text-xl" />
          <div>
            <p className="text-sm font-medium">Profile picture</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(event) => void choosePicture(event)} />
              <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>{avatarUrl ? "Change picture" : "Upload picture"}</Button>
              {avatarUrl && <Button type="button" size="sm" variant="ghost" onClick={() => setAvatarUrl(null)}>Remove</Button>}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">It’s cropped to a square and shown to your family.</p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium sm:col-span-2">Name
            <input required maxLength={150} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} className={fieldClassName} />
          </label>
          {member && (
            <>
              <label className="text-sm font-medium">Role in the family
                <input maxLength={80} placeholder="e.g. Daughter" value={role} onChange={(event) => setRole(event.target.value)} className={fieldClassName} />
              </label>
              <label className="text-sm font-medium">Availability
                <select value={availability} onChange={(event) => setAvailability(event.target.value as Availability)} className={fieldClassName}>
                  {availabilityOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium sm:col-span-2">Availability note <span className="font-normal text-muted-foreground">(optional)</span>
                <input maxLength={200} placeholder="e.g. Available this evening" value={availabilityNote} onChange={(event) => setAvailabilityNote(event.target.value)} className={fieldClassName} />
              </label>
            </>
          )}
        </div>

        <fieldset className="mt-6 border-t border-border pt-5">
          <legend className="float-left mb-1 w-full text-sm font-semibold">Sign-in details</legend>
          <p className="clear-both text-xs text-muted-foreground">You can sign in with your email or your phone number.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium sm:col-span-2">Email
              <input required type="email" maxLength={320} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className={fieldClassName} />
            </label>
            <label className="text-sm font-medium sm:col-span-2" htmlFor="profile-phone">Phone number <span className="font-normal text-muted-foreground">(optional)</span>
              <PhoneInput id="profile-phone" defaultValue={currentUser.phone} onChange={setPhone} className={fieldClassName} />
            </label>
            <label className="text-sm font-medium">New password
              <input type="password" minLength={minPasswordLength} maxLength={1024} autoComplete="new-password" placeholder="Leave blank to keep it" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className={fieldClassName} />
            </label>
            <label className="text-sm font-medium">Confirm new password
              <input type="password" maxLength={1024} autoComplete="new-password" required={newPassword.length > 0} value={newPasswordConfirmation} onChange={(event) => setNewPasswordConfirmation(event.target.value)} className={fieldClassName} />
            </label>
            {needsCurrentPassword && (
              <label className="text-sm font-medium sm:col-span-2">Current password
                <input required type="password" maxLength={1024} autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className={fieldClassName} />
                <span className="mt-1.5 block text-xs font-normal text-muted-foreground">
                  Needed to change your email, phone number or password.{newPassword ? " Changing your password signs you out on your other devices." : ""}
                </span>
              </label>
            )}
          </div>
        </fieldset>

        <CalendarLink />
        <TelegramLink />

        {errorMessage && <p role="alert" className="mt-4 rounded-lg bg-alert/10 px-3 py-2 text-sm text-alert">{errorMessage}</p>}

        <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={() => dialogRef.current?.close()}>Cancel</Button>
          <Button type="submit" disabled={isSaving || !name.trim()}>{isSaving ? "Saving…" : "Save changes"}</Button>
        </div>
      </form>
    </dialog>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const Field = ({
  label,
  name,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  name: string;
}) => (
  <div>
    <label className="field-label" htmlFor={name}>
      {label}
    </label>
    <input
      id={name}
      name={name}
      className="field-input"
      {...props}
    />
  </div>
);

const Select = ({
  label,
  name,
  values,
  required,
}: {
  label: string;
  name: string;
  values: string[];
  required?: boolean;
}) => (
  <div>
    <label className="field-label" htmlFor={name}>
      {label}
    </label>

    <select
      id={name}
      name={name}
      required={required}
      className="field-input"
    >
      {values.map((value) => (
        <option key={value} value={value}>
          {value || "Select…"}
        </option>
      ))}
    </select>
  </div>
);

export default function ClientKycForm({
  currentUserId,
  existingIds,
  clientUsers = [],
}: {
  currentUserId: string;
  existingIds?: string[];
  clientUsers?: {
    userid: string;
    fullname: string;
    email: string;
  }[];
}) {
  const router = useRouter();

  const [type, setType] = useState("Individual");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(
    null,
  );

  async function submit(
    e: React.FormEvent<HTMLFormElement>,
  ) {
    e.preventDefault();

    setError(null);
    setSuccess(null);
    setSaving(true);

    const form = e.currentTarget;
    const data = new FormData(form);

    const get = (name: string) =>
      String(data.get(name) ?? "").trim();

    if (
      type === "Corporate" &&
      !get("directorName")
    ) {
      setSaving(false);
      setError(
        "A Corporate client needs at least one director or authorised signatory.",
      );
      return;
    }

    try {
      const response = await fetch("/api/clients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type,
          name: get("name"),
          phone: get("phone"),
          email: get("email"),
          address: get("address"),

          idType: get("idType"),
          idNumber: get("idNumber"),
          issuer: get("issuer"),
          expiry: get("expiry"),

          rcNumber: get("rcNumber"),
          business: get("business"),
          directorName: get("directorName"),
          directorPosition: get("directorPosition"),
          directorDate: get("directorDate"),

          ownerName: get("ownerName"),
          ownership: get("ownership"),
          ownerContact: get("ownerContact"),

          payment: get("payment"),
          source: get("source"),
          supportingDoc: get("supportingDoc"),

          declaration: get("declaration"),
          declarationDate: get("declarationDate"),

          linkedUser: get("linkedUser"),

          risk: get("risk"),
          riskComments: get("riskComments"),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(
          result.error ??
            "Could not create the client.",
        );
        return;
      }

      if (response.status === 207) {
        setError(result.error);
        return;
      }

      setSuccess(
        result.emailSent
          ? `${result.clientid} created successfully. Client Portal login details and password-reset instructions were sent to ${get(
              "email",
            )}.`
          : `${result.clientid} created successfully, but the Client Portal email could not be sent.`,
      );

      form.reset();
      setType("Individual");
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "An unexpected error occurred.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <p className="section-title">
        New client KYC intake
      </p>

      <div className="mt-4">
        <label
          className="field-label"
          htmlFor="type"
        >
          Client type
        </label>

        <select
          id="type"
          name="type"
          value={type}
          onChange={(event) =>
            setType(event.target.value)
          }
          className="field-input"
        >
          <option>Individual</option>
          <option>Corporate</option>
          <option>Other</option>
        </select>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field
          label="Full name / company name"
          name="name"
          required
          maxLength={150}
        />

        <Field
          label="Phone number"
          name="phone"
          required
          maxLength={15}
        />
      </div>

      <div className="mt-4">
        <Field
          label="Email address"
          name="email"
          type="email"
          required
          maxLength={100}
        />
      </div>

      <div className="mt-4">
        <Field
          label="Address"
          name="address"
          required
          maxLength={200}
        />
      </div>

      {type === "Individual" && (
        <>
          <p className="section-title mt-6">
            Identification
          </p>

          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Select
              label="ID type"
              name="idType"
              required
              values={[
                "National ID",
                "International Passport",
                "Driver's License",
              ]}
            />

            <Field
              label="ID number"
              name="idNumber"
              required
              maxLength={20}
            />

            <Field
              label="Issuing authority"
              name="issuer"
              required
              maxLength={50}
            />

            <Field
              label="ID expiry date"
              name="expiry"
              type="date"
              required
            />
          </div>
        </>
      )}

      {type === "Corporate" && (
        <>
          <p className="section-title mt-6">
            Corporate & ownership
          </p>

          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field
              label="RC number"
              name="rcNumber"
              required
              maxLength={15}
            />

            <Field
              label="Nature of business"
              name="business"
              required
              maxLength={100}
            />

            <Field
              label="Director / signatory name"
              name="directorName"
              required
            />

            <Field
              label="Position"
              name="directorPosition"
              required
              maxLength={50}
            />

            <Field
              label="Signature date"
              name="directorDate"
              type="date"
            />

            <Field
              label="Beneficial owner (10%+)"
              name="ownerName"
            />

            <Field
              label="Ownership %"
              name="ownership"
              type="number"
              min="10"
              max="100"
              step="0.01"
            />

            <Field
              label="Owner contact"
              name="ownerContact"
              maxLength={15}
            />
          </div>
        </>
      )}

      <p className="section-title mt-6">
        Payment, declaration & internal review
      </p>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <Select
          label="Preferred payment method"
          name="payment"
          required
          values={[
            "Bank Transfer",
            "Cheque",
            "Both",
          ]}
        />

        <Select
          label="Source of funds"
          name="source"
          values={[
            "",
            "Personal Savings",
            "Business Income",
            "Loan",
            "Investment",
            "Donation/Grant",
            "Other",
          ]}
        />

        <Field
          label="Supporting document"
          name="supportingDoc"
        />

        <Field
          label="Declaration name"
          name="declaration"
          required
        />

        <Field
          label="Declaration date"
          name="declarationDate"
          type="date"
          required
        />

        {clientUsers.length > 0 && (
          <div className="sm:col-span-2">
            <label className="field-label">
              Link Client Portal account
            </label>

            <select
              name="linkedUser"
              className="field-input"
            >
              <option value="">
                Create a new Client Portal account
              </option>

              {clientUsers.map((user) => (
                <option
                  key={user.userid}
                  value={user.userid}
                >
                  {user.fullname} - {user.email}
                </option>
              ))}
            </select>

            <p className="mt-1 text-xs text-slate-400">
              Select an existing Client Portal account
              only when this client should use that
              existing login.
            </p>
          </div>
        )}

        <Select
          label="Risk category (Staff only)"
          name="risk"
          values={["", "Low", "Medium", "High"]}
        />
      </div>

      <div className="mt-4">
        <Field
          label="Risk comments"
          name="riskComments"
        />
      </div>

      {error && (
        <p className="field-error mt-3">
          {error}
        </p>
      )}

      {success && (
        <p className="mt-3 text-sm text-green-700">
          {success}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="btn-primary mt-6 w-full"
      >
        {saving
          ? "Creating client…"
          : "Create client & KYC record"}
      </button>
    </form>
  );
}
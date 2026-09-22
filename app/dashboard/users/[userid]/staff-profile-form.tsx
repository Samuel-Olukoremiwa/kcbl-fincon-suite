"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  MAX_STAFF_DOCUMENT_BYTES,
  STAFF_DOCUMENT_TYPES,
} from "@/lib/staff-records";

type StaffUser = {
  userid: string;
  fullname: string;
  email: string | null;
  phonenumber: string | null;
  department: string | null;
  status: string | null;
  roleName: string;
};

type StaffProfile = Record<string, any>;

type StaffReference = {
  referenceid?: number;
  referencenumber: number;
  fullname?: string | null;
  relationshipposition?: string | null;
  organisation?: string | null;
  address?: string | null;
  phone?: string | null;
};

type StaffDocument = {
  documentid: number;
  documenttype: string;
  filename: string;
  mimetype: string;
  filesize: number | string;
  uploadedbyuserid: string;
  uploadedat: string;
  verified: boolean;
  verifiedbyuserid?: string | null;
  verifiedat?: string | null;
  verificationremarks?: string | null;
};

type Permissions = {
  canEditCore: boolean;
  canViewSensitive: boolean;
  canEditSensitive: boolean;
  canVerify: boolean;
};

const emptyReference = (number: number): StaffReference => ({
  referencenumber: number,
  fullname: "",
  relationshipposition: "",
  organisation: "",
  address: "",
  phone: "",
});

function stringValue(value: unknown) {
  return value == null ? "" : String(value);
}

function boolValue(value: unknown) {
  return value === true;
}

function fileSize(bytes: number | string) {
  const value = Number(bytes);
  if (!Number.isFinite(value)) return "—";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export default function StaffProfileForm({
  user,
  initialProfile,
  initialReferences,
  initialDocuments,
  permissions,
}: {
  user: StaffUser;
  initialProfile: StaffProfile;
  initialReferences: StaffReference[];
  initialDocuments: StaffDocument[];
  permissions: Permissions;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState<StaffProfile>({ ...initialProfile });
  const [references, setReferences] = useState<StaffReference[]>([
    initialReferences.find((item) => item.referencenumber === 1) ?? emptyReference(1),
    initialReferences.find((item) => item.referencenumber === 2) ?? emptyReference(2),
  ]);
  const [documents, setDocuments] = useState<StaffDocument[]>(initialDocuments);
  const [documentType, setDocumentType] = useState<string>(STAFF_DOCUMENT_TYPES[0]);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onboardingStatus = stringValue(profile.onboardingstatus || "Draft");

  const verifiedDocuments = useMemo(
    () => documents.filter((document) => document.verified).length,
    [documents],
  );

  function setField(key: string, value: unknown) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function setReference(number: number, key: keyof StaffReference, value: string) {
    setReferences((current) =>
      current.map((reference) =>
        reference.referencenumber === number
          ? { ...reference, [key]: value }
          : reference,
      ),
    );
  }

  async function save(action: "save" | "submit" | "verify") {
    setBusy(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/staff/${user.userid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          profile,
          references,
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        setError(body.error ?? "Could not save the staff record.");
        return;
      }

      if (action === "submit") {
        setField("onboardingstatus", "Submitted");
        setMessage("Staff onboarding record submitted for verification.");
      } else if (action === "verify") {
        setField("onboardingstatus", "Verified");
        setMessage("Staff onboarding record verified.");
      } else {
        setMessage("Staff record saved.");
      }

      router.refresh();
    } catch {
      setError("Could not connect to the server.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadDocument() {
    if (!documentFile) {
      setError("Choose a document to upload.");
      return;
    }

    if (documentFile.size > MAX_STAFF_DOCUMENT_BYTES) {
      setError("Each staff document must be 20 MB or smaller.");
      return;
    }

    if (!["application/pdf", "image/jpeg", "image/png"].includes(documentFile.type)) {
      setError("Staff documents must be PDF, JPG, or PNG files.");
      return;
    }

    setBusy(true);
    setMessage(null);
    setError(null);

    try {
      const details = {
        documenttype: documentType,
        filename: documentFile.name,
        filesize: documentFile.size,
        mimetype: documentFile.type,
      };

      const signedResponse = await fetch(
        `/api/staff/${user.userid}/documents/upload-url`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(details),
        },
      );

      const signedBody = await signedResponse.json();

      if (!signedResponse.ok) {
        throw new Error(signedBody.error ?? "Could not prepare the upload.");
      }

      const { error: uploadError } = await createClient()
        .storage.from("staff-documents")
        .uploadToSignedUrl(signedBody.storagepath, signedBody.token, documentFile, {
          contentType: documentFile.type,
        });

      if (uploadError) throw new Error(uploadError.message);

      const completeResponse = await fetch(
        `/api/staff/${user.userid}/documents/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...details,
            storagepath: signedBody.storagepath,
          }),
        },
      );

      const completeBody = await completeResponse.json();

      if (!completeResponse.ok) {
        throw new Error(completeBody.error ?? "Could not save the uploaded document.");
      }

      setDocumentFile(null);
      const input = document.getElementById("staff-document-file") as HTMLInputElement | null;
      if (input) input.value = "";
      setMessage("Staff document uploaded.");
      router.refresh();

      setDocuments((current) => [
        {
          documentid: completeBody.documentid,
          documenttype: documentType,
          filename: details.filename,
          filesize: details.filesize,
          mimetype: details.mimetype,
          uploadedbyuserid: "Current user",
          uploadedat: new Date().toISOString(),
          verified: false,
        },
        ...current,
      ]);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Document upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyDocument(document: StaffDocument, verified: boolean) {
    setBusy(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(
        `/api/staff/${user.userid}/documents/${document.documentid}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ verified }),
        },
      );

      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "Could not update document verification.");
        return;
      }

      setDocuments((current) =>
        current.map((item) =>
          item.documentid === document.documentid
            ? { ...item, verified }
            : item,
        ),
      );
      setMessage(verified ? "Document verified." : "Document verification removed.");
    } catch {
      setError("Could not connect to the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 space-y-6">
      {(message || error) && (
        <div
          className={`rounded-md px-4 py-3 text-sm ${
            error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
          }`}
        >
          {error ?? message}
        </div>
      )}

      <Section title="Account & Personal Information">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ReadOnly label="Full name" value={user.fullname} />
          <ReadOnly label="Email address" value={user.email ?? "—"} />
          <ReadOnly label="Phone number" value={user.phonenumber ?? "—"} />
          <Field
            label="Date of birth"
            type="date"
            value={stringValue(profile.dateofbirth)}
            onChange={(value) => setField("dateofbirth", value)}
            disabled={!permissions.canEditCore}
          />
          <Field
            label="Gender"
            value={stringValue(profile.gender)}
            onChange={(value) => setField("gender", value)}
            disabled={!permissions.canEditCore}
          />
          <Field
            label="Nationality"
            value={stringValue(profile.nationality)}
            onChange={(value) => setField("nationality", value)}
            disabled={!permissions.canEditCore}
          />
          <Field
            label="State of origin"
            value={stringValue(profile.stateoforigin)}
            onChange={(value) => setField("stateoforigin", value)}
            disabled={!permissions.canEditCore}
          />
          <Field
            label="Local Government Area"
            value={stringValue(profile.localgovernmentarea)}
            onChange={(value) => setField("localgovernmentarea", value)}
            disabled={!permissions.canEditCore}
          />
          <TextArea
            label="Residential address"
            value={stringValue(profile.residentialaddress)}
            onChange={(value) => setField("residentialaddress", value)}
            disabled={!permissions.canEditCore}
          />
        </div>
      </Section>

      <Section title="Educational & Professional Information">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Highest qualification" value={stringValue(profile.highestqualification)} onChange={(value) => setField("highestqualification", value)} disabled={!permissions.canEditCore} />
          <Field label="Institution" value={stringValue(profile.institution)} onChange={(value) => setField("institution", value)} disabled={!permissions.canEditCore} />
          <Field label="Course / area of study" value={stringValue(profile.courseofstudy)} onChange={(value) => setField("courseofstudy", value)} disabled={!permissions.canEditCore} />
          <Field label="Year obtained" type="number" value={stringValue(profile.yearobtained)} onChange={(value) => setField("yearobtained", value)} disabled={!permissions.canEditCore} />
          <TextArea label="Professional certifications / licences" value={stringValue(profile.professionalcertifications)} onChange={(value) => setField("professionalcertifications", value)} disabled={!permissions.canEditCore} />
          <TextArea label="Relevant skills / area of specialization" value={stringValue(profile.relevantskills)} onChange={(value) => setField("relevantskills", value)} disabled={!permissions.canEditCore} />
          <Field label="Years of relevant experience" type="number" step="0.5" min="0" value={stringValue(profile.yearsofrelevantexperience)} onChange={(value) => setField("yearsofrelevantexperience", value)} disabled={!permissions.canEditCore} />
        </div>
      </Section>

      <Section title="Previous Employment">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Most recent employer" value={stringValue(profile.mostrecentemployer)} onChange={(value) => setField("mostrecentemployer", value)} disabled={!permissions.canEditCore} />
          <Field label="Position held" value={stringValue(profile.previouspositionheld)} onChange={(value) => setField("previouspositionheld", value)} disabled={!permissions.canEditCore} />
          <Field label="Duration" value={stringValue(profile.previousemploymentduration)} onChange={(value) => setField("previousemploymentduration", value)} disabled={!permissions.canEditCore} />
          <TextArea label="Reason for leaving" value={stringValue(profile.reasonforleaving)} onChange={(value) => setField("reasonforleaving", value)} disabled={!permissions.canEditCore} />
          <TextArea label="Previous project / site experience" value={stringValue(profile.previousprojectexperience)} onChange={(value) => setField("previousprojectexperience", value)} disabled={!permissions.canEditCore} />
        </div>
      </Section>

      <Section title="Emergency Contact">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Full name" value={stringValue(profile.emergencycontactname)} onChange={(value) => setField("emergencycontactname", value)} disabled={!permissions.canEditCore} />
          <Field label="Relationship" value={stringValue(profile.emergencyrelationship)} onChange={(value) => setField("emergencyrelationship", value)} disabled={!permissions.canEditCore} />
          <Field label="Phone number" value={stringValue(profile.emergencyphone)} onChange={(value) => setField("emergencyphone", value)} disabled={!permissions.canEditCore} />
          <Field label="Alternative phone number" value={stringValue(profile.emergencyalternativephone)} onChange={(value) => setField("emergencyalternativephone", value)} disabled={!permissions.canEditCore} />
          <TextArea label="Address" value={stringValue(profile.emergencyaddress)} onChange={(value) => setField("emergencyaddress", value)} disabled={!permissions.canEditCore} />
        </div>
      </Section>

      {permissions.canViewSensitive && (
        <Section title="Bank & Payroll Information" note="Restricted to MD Office and Super User.">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Bank name" value={stringValue(profile.bankname)} onChange={(value) => setField("bankname", value)} disabled={!permissions.canEditSensitive} />
            <Field label="Account name" value={stringValue(profile.bankaccountname)} onChange={(value) => setField("bankaccountname", value)} disabled={!permissions.canEditSensitive} />
            <Field label="Account number" value={stringValue(profile.bankaccountnumber)} onChange={(value) => setField("bankaccountnumber", value)} disabled={!permissions.canEditSensitive} />
            <Field label="TIN (if applicable)" value={stringValue(profile.tin)} onChange={(value) => setField("tin", value)} disabled={!permissions.canEditSensitive} />
          </div>
        </Section>
      )}

      <Section title="Site / PPE Information" note="Complete where the staff member will work on construction sites.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Role / trade" value={stringValue(profile.roletrade)} onChange={(value) => setField("roletrade", value)} disabled={!permissions.canEditCore} />
          <Field label="Primary area of work" value={stringValue(profile.primaryareaofwork)} onChange={(value) => setField("primaryareaofwork", value)} disabled={!permissions.canEditCore} />
          <Field label="Safety boot size" value={stringValue(profile.safetybootsize)} onChange={(value) => setField("safetybootsize", value)} disabled={!permissions.canEditCore} />
          <Field label="Coverall size" value={stringValue(profile.coverallsize)} onChange={(value) => setField("coverallsize", value)} disabled={!permissions.canEditCore} />
          <Field label="Reflective jacket / vest size" value={stringValue(profile.reflectivevestsize)} onChange={(value) => setField("reflectivevestsize", value)} disabled={!permissions.canEditCore} />
          <Field label="Helmet size" value={stringValue(profile.helmetsize)} onChange={(value) => setField("helmetsize", value)} disabled={!permissions.canEditCore} />
          <TextArea label="Other relevant skills / equipment operated" value={stringValue(profile.equipmentandotherskills)} onChange={(value) => setField("equipmentandotherskills", value)} disabled={!permissions.canEditCore} />
        </div>
      </Section>

      <Section title="References">
        <div className="grid gap-5 xl:grid-cols-2">
          {references.map((reference) => (
            <div key={reference.referencenumber} className="rounded-md border border-slate-200 p-4">
              <p className="mb-4 text-sm font-semibold">Reference {reference.referencenumber}</p>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Name" value={stringValue(reference.fullname)} onChange={(value) => setReference(reference.referencenumber, "fullname", value)} disabled={!permissions.canEditCore} />
                <Field label="Relationship / position" value={stringValue(reference.relationshipposition)} onChange={(value) => setReference(reference.referencenumber, "relationshipposition", value)} disabled={!permissions.canEditCore} />
                <Field label="Organisation" value={stringValue(reference.organisation)} onChange={(value) => setReference(reference.referencenumber, "organisation", value)} disabled={!permissions.canEditCore} />
                <Field label="Phone" value={stringValue(reference.phone)} onChange={(value) => setReference(reference.referencenumber, "phone", value)} disabled={!permissions.canEditCore} />
                <TextArea label="Address" value={stringValue(reference.address)} onChange={(value) => setReference(reference.referencenumber, "address", value)} disabled={!permissions.canEditCore} />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Supporting Documents"
        note={`${verifiedDocuments} of ${documents.length} uploaded documents verified.`}
      >
        {permissions.canEditCore && (
          <div className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 md:grid-cols-[240px_1fr_auto] md:items-end">
            <label>
              <span className="field-label">Document type</span>
              <select className="field-input" value={documentType} onChange={(event) => setDocumentType(event.target.value)}>
                {STAFF_DOCUMENT_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="field-label">File</span>
              <input
                id="staff-document-file"
                className="field-input"
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <button type="button" className="btn-primary" disabled={busy || !documentFile} onClick={uploadDocument}>
              Upload
            </button>
          </div>
        )}

        <div className="mt-4 overflow-x-auto rounded-md border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Document</th>
                <th className="px-4 py-3">Uploaded</th>
                <th className="px-4 py-3">Verification</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {documents.map((document) => (
                <tr key={document.documentid}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{document.documenttype}</p>
                    <p className="text-xs text-slate-400">{document.filename} · {fileSize(document.filesize)}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{new Date(document.uploadedat).toLocaleString("en-NG")}</td>
                  <td className="px-4 py-3">
                    <span className={document.verified ? "badge-success" : "badge-warning"}>
                      {document.verified ? "Verified" : "Pending"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <a className="text-sm font-medium text-navy hover:underline" href={`/api/staff/${user.userid}/documents/${document.documentid}`} target="_blank" rel="noreferrer">
                        View
                      </a>
                      {permissions.canVerify && (
                        <button type="button" className="text-sm font-medium text-navy hover:underline" disabled={busy} onClick={() => verifyDocument(document, !document.verified)}>
                          {document.verified ? "Unverify" : "Verify"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!documents.length && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-400">No staff documents uploaded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Staff Declaration">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Staff name" value={stringValue(profile.declarationstaffname || user.fullname)} onChange={(value) => setField("declarationstaffname", value)} disabled={!permissions.canEditCore} />
          <Field label="Declaration date" type="date" value={stringValue(profile.declarationdate)} onChange={(value) => setField("declarationdate", value)} disabled={!permissions.canEditCore} />
          <label className="flex items-start gap-2 rounded-md border border-slate-200 p-4 text-sm">
            <input type="checkbox" className="mt-1" checked={boolValue(profile.declarationconfirmed)} onChange={(event) => setField("declarationconfirmed", event.target.checked)} disabled={!permissions.canEditCore} />
            <span>I confirm that the information supplied is true and accurate to the best of the staff member&apos;s knowledge.</span>
          </label>
        </div>
      </Section>

      {permissions.canVerify && (
        <Section title="KCBL Admin Use Only">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Date received" type="date" value={stringValue(profile.datereceived)} onChange={(value) => setField("datereceived", value)} />
            <Field label="Staff ID assigned" value={stringValue(profile.staffidassigned)} onChange={(value) => setField("staffidassigned", value)} />
            <SelectField label="Employment status" value={stringValue(profile.employmentstatus || "Active")} values={["Active", "Probation", "Suspended", "Resigned", "Terminated", "Retired"]} onChange={(value) => setField("employmentstatus", value)} />
            <Check label="Employment letter issued" checked={boolValue(profile.employmentletterissued)} onChange={(value) => setField("employmentletterissued", value)} />
            <Check label="PPE issued" checked={boolValue(profile.ppeissued)} onChange={(value) => setField("ppeissued", value)} />
            <Check label="HSE induction completed" checked={boolValue(profile.hseinductioncompleted)} onChange={(value) => setField("hseinductioncompleted", value)} />
            <Check label="Staff file created" checked={boolValue(profile.stafffilecreated)} onChange={(value) => setField("stafffilecreated", value)} />
            <SelectField label="Medical result" value={profile.medicalresultgood === null || profile.medicalresultgood === undefined ? "" : profile.medicalresultgood ? "Good" : "Not Good"} values={["", "Good", "Not Good"]} onChange={(value) => setField("medicalresultgood", value === "" ? null : value === "Good")} />
            <TextArea label="Remarks" value={stringValue(profile.adminremarks)} onChange={(value) => setField("adminremarks", value)} />
          </div>
        </Section>
      )}

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur">
        <div>
          <p className="text-sm font-semibold">Onboarding status: {onboardingStatus}</p>
          <p className="text-xs text-slate-500">Save drafts as information arrives; submit when the staff declaration is complete.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {permissions.canEditCore && (
            <>
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => save("save")}>Save draft</button>
              {onboardingStatus !== "Verified" && (
                <button type="button" className="btn-primary" disabled={busy} onClick={() => save("submit")}>Submit onboarding</button>
              )}
            </>
          )}
          {permissions.canVerify && onboardingStatus === "Submitted" && (
            <button type="button" className="btn-primary" disabled={busy} onClick={() => save("verify")}>Verify onboarding</button>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5 md:p-6">
      <div className="mb-5">
        <h2 className="text-base font-semibold">{title}</h2>
        {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="field-label">{label}</p>
      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{value}</div>
    </div>
  );
}

function Field({ label, value, onChange, disabled = false, type = "text", ...props }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; type?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "disabled">) {
  return (
    <label>
      <span className="field-label">{label}</span>
      <input className="field-input" type={type} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} {...props} />
    </label>
  );
}

function TextArea({ label, value, onChange, disabled = false }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return (
    <label>
      <span className="field-label">{label}</span>
      <textarea className="field-input min-h-24" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="field-label">{label}</span>
      <select className="field-input" value={value} onChange={(event) => onChange(event.target.value)}>
        {values.map((item) => <option key={item || "blank"} value={item}>{item || "Select…"}</option>)}
      </select>
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}
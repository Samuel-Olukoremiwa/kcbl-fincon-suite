from pathlib import Path

root=Path.cwd()
def load(path):
 p=root/path
 if not p.exists(): raise SystemExit(f'Missing {p}; run from KCBL repository root')
 return p,p.read_text()
def repl(s, old, new, desc):
 if old not in s: raise SystemExit(f'Cannot find {desc}: repository version differs, nothing has been written yet')
 return s.replace(old,new,1)

api_path,api=load('app/api/transactions/outflow/route.ts')
ui_path,ui=load('app/dashboard/transactions/transactions-client.tsx')
page_path,page=load('app/dashboard/transactions/page.tsx')
queue_path,queue=load('app/dashboard/transactions/approval-queue.tsx')

# server-side: derive trusted totals from individually validated category lines
api=repl(api,'''  const category = String(body.category ?? "").trim();
  const amount = Number(body.amount);''','''  const rawLines = Array.isArray(body.categories)
    ? body.categories
    : [{ category: body.category, amount: body.amount }];

  if (rawLines.length < 1 || rawLines.length > 30) {
    return NextResponse.json(
      { error: "Choose between 1 and 30 expense categories." },
      { status: 400 },
    );
  }

  const breakdown: { category: string; amount: string }[] = [];
  let totalCents = 0;
  const seenCategories = new Set<string>();

  for (const raw of rawLines) {
    const categoryName = String(raw?.category ?? "").trim();
    const amountText = String(raw?.amount ?? "").replace(/,/g, "").trim();
    if (!categoryName || seenCategories.has(categoryName)) {
      return NextResponse.json(
        { error: "Select unique, nonempty expense categories." },
        { status: 400 },
      );
    }
    if (!/^(0|[1-9]\\d*)(\\.\\d{1,2})?$/.test(amountText)) {
      return NextResponse.json(
        { error: `Invalid amount for ${categoryName}. Use up to two decimal places.` },
        { status: 400 },
      );
    }
    const numeric = Number(amountText);
    const cents = Math.round(numeric * 100);
    if (!Number.isSafeInteger(cents) || cents <= 0) {
      return NextResponse.json(
        { error: `Enter a positive amount for ${categoryName}.` },
        { status: 400 },
      );
    }
    seenCategories.add(categoryName);
    totalCents += cents;
    if (!Number.isSafeInteger(totalCents)) {
      return NextResponse.json({ error: "Expense total exceeds allowed range." }, { status: 400 });
    }
    breakdown.push({ category: categoryName, amount: (cents / 100).toFixed(2) });
  }

  const category = breakdown[0].category;
  const amount = totalCents / 100;''','server amount validation')
api=repl(api,'''  const { data: categoryRow } = await supabase
    .from("transactioncategories")
    .select(
      "categoryid,categoryname,isinhouse,active",
    )
    .eq("categoryname", category)
    .eq("active", true)
    .single();

  if (!categoryRow) {
    return NextResponse.json(
      {
        error:
          "The selected expense category is no longer active.",
      },
      { status: 400 },
    );
  }

  if (
    payeetype === "In-House" &&
    !categoryRow.isinhouse
  ) {
    return NextResponse.json(
      {
        error:
          "The selected category is not an in-house category.",
      },
      { status: 400 },
    );
  }

  if (
    payeetype !== "In-House" &&
    categoryRow.isinhouse
  ) {
    return NextResponse.json(
      {
        error:
          "An in-house category cannot be used for a supplier or subcontractor.",
      },
      { status: 400 },
    );
  }''','''  const { data: categoryRows, error: categoryError } = await supabase
    .from("transactioncategories")
    .select("categoryname,isinhouse,active")
    .in("categoryname", breakdown.map((line) => line.category))
    .eq("active", true);

  if (categoryError || (categoryRows ?? []).length !== breakdown.length ||
      (categoryRows ?? []).some((row) =>
        Boolean(row.isinhouse) !== (payeetype === "In-House"))) {
    return NextResponse.json(
      { error: "One or more selected categories are inactive or inappropriate for this payee type." },
      { status: 400 },
    );
  }''','category validation')
api=repl(api,'''      expenditurecategory: category,
      amount,''','''      expenditurecategory: category,
      expensepayeetype: payeetype,
      expensebreakdown: breakdown,
      amount,''','insert multi categories')

# client-side: formatted money input, re-used for cash inflow + every expense line
amount_component='''
function MoneyInput({
  value,
  onChange,
  label,
  name,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  name?: string;
}) {
  const display = value.replace(/^(\\d+)(?=\\d)/, "$1");
  const parts = display.split(".");
  const formatted = (parts[0] || "").replace(/\\B(?=(\\d{3})+(?!\\d))/g, ",") +
    (parts.length > 1 ? "." + parts[1] : "");
  return (
    <div>
      <label className="field-label">{label}</label>
      <input
        name={name}
        type="text"
        inputMode="decimal"
        className="field-input"
        placeholder="0.00"
        value={formatted}
        required
        onChange={(event) => {
          let clean = event.target.value.replace(/,/g, "").replace(/[^\\d.]/g, "");
          const dot = clean.indexOf(".");
          if (dot >= 0) clean = clean.slice(0, dot + 1) + clean.slice(dot + 1).replace(/\\./g, "").slice(0, 2);
          onChange(clean);
        }}
      />
    </div>
  );
}
'''
ui += '\n'+amount_component
ui=repl(ui,'''  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [categories, setCategories]''','''  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [expenseLines, setExpenseLines] = useState<
    { category: string; amount: string }[]
  >([{ category: "", amount: "" }]);
  const [categories, setCategories]''','expense state')
ui=repl(ui,'''  const categoryValues = categories
    .filter((category) =>
      payee === "In-House"
        ? category.isinhouse
        : !category.isinhouse,
    )
    .map((category) => [
      category.categoryname,
      category.categoryname,
    ]);''','''  const categoryValues = categories
    .filter((category) =>
      payee === "In-House"
        ? category.isinhouse
        : !category.isinhouse,
    )
    .map((category) => [category.categoryname, category.categoryname]);

  const expenseTotal = expenseLines.reduce(
    (sum, line) => sum + Number(line.amount || 0), 0,
  );''','category values')
ui=repl(ui,'''    try {
      const response = await fetch(
        "/api/transactions/outflow",''','''    if (expenseLines.some((line) => !line.category || !(Number(line.amount) > 0)) ||
        new Set(expenseLines.map((line) => line.category)).size !== expenseLines.length) {
      setMsg("Select different categories and positive amounts for each line.");
      setSaving(false);
      return;
    }

    try {
      const response = await fetch(
        "/api/transactions/outflow",''','expense validation')
ui=repl(ui,'''            category: get("category"),
            amount: get("amount"),''','''            categories: expenseLines.map((line) => ({
              category: line.category,
              amount: line.amount,
            })),''','expense payload')
ui=repl(ui,'''      form.reset();
      setPayee("Supplier");''','''      form.reset();
      setPayee("Supplier");
      setExpenseLines([{ category: "", amount: "" }]);''','expense reset')
ui=repl(ui,'''                    onClick={() => setPayee(type)}''','''                    onClick={() => {
                      setPayee(type);
                      setExpenseLines([{ category: "", amount: "" }]);
                    }}''','payee change')
ui=repl(ui,'''            <Select
              label="Category"
              name="category"
              values={categoryValues}
              required
            />

            <Field
              label="Amount (₦)"
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              required
            />''','''            <div className="space-y-3">
              <p className="field-label">Expense categories and amounts</p>
              {expenseLines.map((line, index) => (
                <div key={index} className="rounded-md border border-slate-200 p-3 space-y-2">
                  <label className="field-label">Category {index + 1}</label>
                  <select
                    className="field-input"
                    required
                    value={line.category}
                    onChange={(event) => setExpenseLines((old) =>
                      old.map((item, i) => i === index ? { ...item, category: event.target.value } : item))}
                  >
                    <option value="">Select category…</option>
                    {categoryValues.map(([value, label]) => (
                      <option key={value} value={value} disabled={expenseLines.some((x, j) => j !== index && x.category === value)}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <MoneyInput
                    label="Amount (₦)"
                    value={line.amount}
                    onChange={(amount) => setExpenseLines((old) =>
                      old.map((item, i) => i === index ? { ...item, amount } : item))}
                  />
                  {expenseLines.length > 1 && (
                    <button type="button" className="btn-secondary"
                      onClick={() => setExpenseLines((old) => old.filter((_, i) => i !== index))}>
                      Remove category
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="btn-secondary"
                disabled={expenseLines.length >= 30 || expenseLines.length >= categoryValues.length}
                onClick={() => setExpenseLines((old) => [...old, { category: "", amount: "" }])}>
                + Add another category
              </button>
              <p className="text-lg font-semibold">
                Total expense: {money(expenseTotal)}
              </p>
            </div>''','expense form categories')
# inflow formatted input, state must reset on submission
ui=repl(ui,'''  const [saving, setSaving] = useState(false);

  const canCreate =''','''  const [saving, setSaving] = useState(false);
  const [inflowAmount, setInflowAmount] = useState("");

  const canCreate =''','inflow amount state')
ui=repl(ui,'''            <Field
              label="Amount (₦)"
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              required
            />''','''            <MoneyInput
              label="Amount (₦)"
              name="amount"
              value={inflowAmount}
              onChange={setInflowAmount}
            />''','inflow amount form')
ui=repl(ui,'''            amount: get("amount"),
            date: get("date"),''','''            amount: get("amount").replace(/,/g, ""),
            date: get("date"),''','inflow request numeric')
ui=repl(ui,'''      form.reset();
      setSource("Client");''','''      form.reset();
      setInflowAmount("");
      setSource("Client");''','inflow reset')

# page: structured allocations to table and approval queue, distinct unassigned/inhouse via new type
page=repl(page,'''transactionid,projectid,supplierid,subcontractorid,expenditurecategory,amount,transactiondate''','''transactionid,projectid,supplierid,subcontractorid,expensepayeetype,expensebreakdown,expenditurecategory,amount,transactiondate''','select structured lines')
page=repl(page,'''      payeetype: hasSupplier
        ? "Supplier"
        : hasSubcontractor
          ? "Subcontractor"
          : "Unassigned",''','''      payeetype: row.expensepayeetype ?? (hasSupplier
        ? "Supplier"
        : hasSubcontractor
          ? "Subcontractor"
          : "Unassigned"),''','payee display')
page=repl(page,'''      payeename: hasSupplier''','''      payeename: row.expensepayeetype === "In-House"
        ? "In-House"
        : hasSupplier''','payee name')

# approval queue shows per-line amounts, and total is still parent amount
queue=repl(queue,'''  expenditurecategory?: string | null;''','''  expenditurecategory?: string | null;
  expensebreakdown?: { category: string; amount: string | number }[] | null;''','queue type')
queue=repl(queue,'''                  <Detail
                    label="Amount"
                    value={money(
                      row.amount,
                    )}
                  />''','''                  <Detail label="Amount" value={money(row.amount)} />
                  {row.kind === "Cash Outflow" && Array.isArray(row.expensebreakdown) && row.expensebreakdown.length > 0 && (
                    <div className="sm:col-span-2 lg:col-span-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Category breakdown</p>
                      {row.expensebreakdown.map((line, index) => (
                        <p key={`${line.category}-${index}`} className="mt-1 flex justify-between gap-3 text-sm text-ink">
                          <span>{line.category}</span><strong>{money(line.amount)}</strong>
                        </p>
                      ))}
                    </div>
                  )}''','queue breakdown')

for path,content in [(api_path,api),(ui_path,ui),(page_path,page),(queue_path,queue)]:
 path.write_text(content)
 print('Updated:',path)
print('Apply the supplied SQL migration before running the new app.')

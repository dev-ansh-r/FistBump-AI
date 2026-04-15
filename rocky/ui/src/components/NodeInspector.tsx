import type { NodeDetail } from '../hooks/useModel'

const OP_COLOUR: Record<string, string> = {
  Conv: '#3b82f6', ConvTranspose: '#3b82f6',
  BatchNormalization: '#8b5cf6', LayerNormalization: '#8b5cf6',
  Relu: '#10b981', Gelu: '#10b981', Sigmoid: '#10b981', Clip: '#10b981',
  MaxPool: '#f59e0b', AveragePool: '#f59e0b', GlobalAveragePool: '#f59e0b',
  MatMul: '#ef4444', Gemm: '#ef4444',
  Add: '#06b6d4', Mul: '#06b6d4',
  Concat: '#64748b', Reshape: '#64748b', Transpose: '#64748b',
  Constant: '#94a3b8', Identity: '#94a3b8',
}
function opColour(op: string) { return OP_COLOUR[op] ?? '#d97706' }
function shapeStr(s: (number | string)[]): string {
  return s?.length ? '[' + s.join(', ') + ']' : '?'
}

interface Props {
  node: NodeDetail | null
  onClose: () => void
}

export default function NodeInspector({ node, onClose }: Props) {
  if (!node) return null

  const colour = opColour(node.op_type)
  const activationInputs = node.inputs.filter(i => !i.is_weight)
  const weightInputs = node.inputs.filter(i => i.is_weight)

  return (
    <div style={{
      width: 320,
      height: '100%',
      background: 'var(--bg-panel)',
      borderLeft: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{
            display: 'inline-block',
            background: colour + '22',
            color: colour,
            border: `1px solid ${colour}55`,
            borderRadius: 4,
            padding: '2px 8px',
            fontWeight: 600,
            fontSize: 11,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            marginBottom: 6,
          }}>
            {node.op_type}
          </span>
          <div style={{
            fontSize: 10,
            color: 'var(--text-dim)',
            fontFamily: 'var(--font-mono)',
            wordBreak: 'break-all',
            lineHeight: 1.5,
            background: 'var(--bg-elevated)',
            padding: '4px 6px',
            borderRadius: 3,
            cursor: 'text',
            userSelect: 'all',
          }}>
            {node.name}
          </div>
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: 'var(--text-muted)',
          cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 0 2px', flexShrink: 0,
        }}>×</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {activationInputs.length > 0 && (
          <Section label="Inputs">
            {activationInputs.map((inp, i) => (
              <TensorRow key={i} name={inp.name} shape={inp.shape} dtype={inp.dtype} />
            ))}
          </Section>
        )}

        {node.outputs.length > 0 && (
          <Section label="Outputs">
            {node.outputs.map((out, i) => (
              <TensorRow key={i} name={out.name} shape={out.shape} dtype={out.dtype} />
            ))}
          </Section>
        )}

        {weightInputs.length > 0 && (
          <Section label="Weights">
            {weightInputs.map((w, i) => (
              <TensorRow key={i} name={w.name} shape={w.shape} dtype={w.dtype} accent="#d97706" />
            ))}
          </Section>
        )}

        {Object.keys(node.attributes).length > 0 && (
          <Section label="Attributes">
            {Object.entries(node.attributes).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 8, padding: '3px 0', borderBottom: '1px solid var(--border)', fontSize: 11 }}>
                <span style={{ color: 'var(--text-muted)', minWidth: 80, flexShrink: 0 }}>{k}</span>
                <span style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                  {Array.isArray(v) ? '[' + v.join(', ') + ']' : String(v)}
                </span>
              </div>
            ))}
          </Section>
        )}

        {(node.prev_nodes.length > 0 || node.next_nodes.length > 0) && (
          <Section label="Connections">
            {node.prev_nodes.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={subLabelStyle}>From</div>
                {node.prev_nodes.map(n => <NodeRef key={n} name={n} />)}
              </div>
            )}
            {node.next_nodes.length > 0 && (
              <div>
                <div style={subLabelStyle}>To</div>
                {node.next_nodes.map(n => <NodeRef key={n} name={n} />)}
              </div>
            )}
          </Section>
        )}
      </div>
    </div>
  )
}

const subLabelStyle: React.CSSProperties = {
  fontSize: 10, color: 'var(--text-muted)', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4,
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function TensorRow({ name, shape, dtype, accent }: {
  name: string
  shape: (number | string)[]
  dtype: string | null
  accent?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '3px 0', borderBottom: '1px solid var(--border)', fontSize: 11 }}>
      <span style={{ color: accent ?? 'var(--text-dim)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}
        title={name}>
        {name.length > 22 ? '…' + name.slice(-20) : name}
      </span>
      <span style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{shapeStr(shape)}</span>
      {dtype && <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{dtype}</span>}
    </div>
  )
}

function NodeRef({ name }: { name: string }) {
  return (
    <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', padding: '2px 0', wordBreak: 'break-all' }}>{name}</div>
  )
}

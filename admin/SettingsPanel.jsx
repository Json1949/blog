import { useState } from 'react'
import { testConnection } from '../www/cursor.js'

export function SettingsPanel({ settings, onChange }) {
  const [visible, setVisible] = useState(false)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState(null)

  function update(partial) {
    setResult(null)
    onChange({ ...settings, ...partial })
  }

  async function test() {
    setTesting(true)
    setResult(null)
    try {
      await testConnection({ apiKey: settings.apiKey })
      setResult({ type: 'ok', text: '连接成功，Grok 4.7 High Fast 有响应。' })
    } catch (error) {
      setResult({ type: 'error', text: error.message || '连接失败。' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <>
      <p className="lead">
        优化、生成和记知识点使用 Cursor 的 Grok 4.7 High Fast。密钥留在本机，留空则用已经配好的那一把。
        {' '}
        <a href="https://cursor.com/dashboard" target="_blank" rel="noreferrer">管理 API Key</a>
      </p>
      <form
        className="settings-form"
        onSubmit={(event) => {
          event.preventDefault()
          void test()
        }}
      >
        <div className="field">
          <label htmlFor="api-key">Cursor API Key</label>
          <div className="key-row">
            <input
              id="api-key"
              name="cursor-api-key"
              type={visible ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              placeholder="留空则使用本机已配置的密钥"
              value={settings.apiKey}
              onChange={(event) => update({ apiKey: event.target.value })}
            />
            <button type="button" className="btn btn-quiet" onClick={() => setVisible((value) => !value)}>
              {visible ? '隐藏' : '显示'}
            </button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="model-name">模型</label>
          <input id="model-name" value="Grok 4.7 High Fast" readOnly />
        </div>
        <div className="settings-actions">
          <button type="submit" className="btn btn-yellow" disabled={testing}>
            {testing ? '正在测试…' : '测试连接'}
          </button>
        </div>
        {result ? (
          <p className={result.type === 'error' ? 'banner error' : 'banner ok'} role={result.type === 'error' ? 'alert' : 'status'}>
            {result.text}
          </p>
        ) : null}
      </form>
    </>
  )
}

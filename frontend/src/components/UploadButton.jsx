export default function UploadButton({ onUpload, disabled }) {
  return (
    <label className={`upload-btn${disabled ? ' disabled' : ''}`}>
      <span>{disabled ? 'Running…' : 'Upload PDF'}</span>
      <input
        type="file"
        accept="application/pdf,.pdf"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = '';
        }}
      />
    </label>
  );
}

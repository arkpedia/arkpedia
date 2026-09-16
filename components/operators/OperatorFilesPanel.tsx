import { OperatorFile } from '@/lib/operators/operatorStats';
import styles from './OperatorDetails.module.css';
import OperatorStatModifiers from './OperatorStatModifiers';

export default function OperatorFilesPanel({ files }: { files: OperatorFile[] }) {
  return (
    <section className={styles.files} aria-label="Operator files">
      <h2>Files</h2>
      {files.map(file => (
        <details key={file.section} className={styles.file}>
          <summary>
            <span className={styles.fileHeading}>{file.section}</span>
            <span className={styles.unlock}><OperatorStatModifiers text={file.unlock} /></span>
          </summary>
          <div className={styles.fileText}>{file.description}</div>
        </details>
      ))}
    </section>
  );
}

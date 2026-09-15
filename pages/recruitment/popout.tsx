import RecruitmentTool from '@/components/RecruitmentTool';
import { getRecruitmentPageProps, type RecruitmentProps } from '@/lib/gacha/recruitmentPageData';

export default function RecruitmentPopout(props: RecruitmentProps) {
  return <RecruitmentTool {...props} compact />;
}

RecruitmentPopout.hideSiteChrome = true;

export const getStaticProps = getRecruitmentPageProps;

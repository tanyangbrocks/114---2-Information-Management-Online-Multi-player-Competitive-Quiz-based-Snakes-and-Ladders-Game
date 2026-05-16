import { ScreenClient } from "./ScreenClient";

type Props = {
  params: Promise<{ gameId: string }>;
};

export default function ScreenPage({ params }: Props) {
  return <ScreenClient params={params} />;
}

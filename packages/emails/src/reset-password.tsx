/** @jsxImportSource react */
import {
	Body,
	Container,
	Head,
	Hr,
	Html,
	Img,
	Link,
	Preview,
	Section,
	Tailwind,
	Text,
} from "@react-email/components";

const baseUrl = process.env.VERCEL_URL
	? `https://${process.env.VERCEL_URL}`
	: "http://localhost:5173";

export function ResetPassword({ resetLink }: { resetLink: string }) {
	return (
		<Html>
			<Head />
			<Preview>Réinitialisez votre mot de passe Spice World</Preview>
			<Tailwind
				config={{
					theme: {
						extend: {
							colors: {
								brand: "#007291",
							},
						},
					},
				}}
			>
				<Body className="bg-[#f6f9fc] font-sans">
					<Container className="mx-auto mb-16 bg-white py-5">
						<Section className="px-12">
							<Img
								alt="Spice World"
								height="100"
								src={"/static/spice-world-logo-2.webp"}
								width="100"
							/>
							<Hr className="my-5 border-[#e6ebf1]" />
							<Text className="text-left text-[#525f7f] text-base leading-6">
								Vous avez demandé à réinitialiser votre mot de passe pour votre
								compte Spice World.
							</Text>
							<Text className="text-left text-[#525f7f] text-base leading-6">
								Cliquez sur le bouton ci-dessous pour créer un nouveau mot de
								passe :
							</Text>
							<Link
								className="block w-full rounded bg-[#656ee8] py-2.5 text-center font-bold text-base text-white no-underline"
								href={resetLink}
							>
								Réinitialiser mon mot de passe
							</Link>
							<Hr className="my-5 border-[#e6ebf1]" />
							<Text className="text-left text-[#525f7f] text-base leading-6">
								Si vous n'avez pas demandé cette réinitialisation, vous pouvez
								ignorer cet email en toute sécurité.
							</Text>
							<Text className="text-left text-[#525f7f] text-base leading-6">
								Si vous avez des questions, n'hésitez pas à nous contacter sur
								notre{" "}
								<Link className="text-[#556cd6]" href={`${baseUrl}/support`}>
									formulaire de support
								</Link>
								.
							</Text>
							<Text className="text-left text-[#525f7f] text-base leading-6">
								— L'équipe de Spice World
							</Text>
							<Hr className="my-5 border-[#e6ebf1]" />
							<Text className="text-[#8898aa] text-xs leading-4">
								Épices, 123 Rue des Saveurs, Paris, France
							</Text>
						</Section>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
}

export default ResetPassword;

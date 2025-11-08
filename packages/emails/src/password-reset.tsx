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
	: "http://localhost:3000";

export function PasswordReset() {
	return (
		<Html>
			<Head />
			<Preview>Votre mot de passe Spice World a été réinitialisé</Preview>
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
								Votre mot de passe a été réinitialisé avec succès.
							</Text>
							<Text className="text-left text-[#525f7f] text-base leading-6">
								Vous pouvez maintenant vous connecter à votre compte Spice World
								avec votre nouveau mot de passe.
							</Text>
							<Link
								className="block w-full rounded bg-[#656ee8] py-2.5 text-center font-bold text-base text-white no-underline"
								href={`${baseUrl}/signin`}
							>
								Se connecter
							</Link>
							<Hr className="my-5 border-[#e6ebf1]" />
							<Text className="text-left text-[#525f7f] text-base leading-6">
								Si vous n'êtes pas à l'origine de ce changement, veuillez
								contacter notre support immédiatement via notre{" "}
								<Link className="text-[#556cd6]" href={`${baseUrl}/support`}>
									formulaire de support
								</Link>
								.
							</Text>
							<Text className="text-left text-[#525f7f] text-base leading-6">
								Pour votre sécurité, nous vous recommandons de :
							</Text>
							<Text className="text-left text-[#525f7f] text-base leading-6 pl-4">
								• Utiliser un mot de passe unique pour chaque service
								<br />• Activer l'authentification à deux facteurs si disponible
								<br />• Ne jamais partager votre mot de passe avec qui que ce
								soit
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

export default PasswordReset;

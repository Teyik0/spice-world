import { Body, Container, Head, Hr, Html, Img, Link, Preview, Section, Tailwind, Text } from '@react-email/components'

const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173'

export function VerifyEmail({ verifyLink }: { verifyLink: string }) {
  return (
    <Html>
      <Head />
      <Preview>Bienvenue sur notre site de vente d'épices en ligne !</Preview>
      <Tailwind
        config={{
          theme: {
            extend: {
              colors: {
                brand: '#007291',
              },
            },
          },
        }}
      >
        <Body className="bg-[#f6f9fc] font-sans">
          <Container className="bg-white mx-auto py-5 mb-16">
            <Section className="px-12">
              <Img src={`${baseUrl}/static/logo-epices.png`} width="49" height="21" alt="Spice World" />
              <Hr className="border-[#e6ebf1] my-5" />
              <Text className="text-[#525f7f] text-base leading-6 text-left">
                Merci de vous être inscrit sur notre site de vente d'épices en ligne. Nous sommes ravis de vous compter
                parmi nos clients !
              </Text>
              <Text className="text-[#525f7f] text-base leading-6 text-left">
                Veuillez confirmer votre adresse email en cliquant sur le bouton ci-dessous :
              </Text>
              <Link
                className="bg-[#656ee8] rounded text-white text-base font-bold no-underline text-center block w-full py-2.5"
                href={verifyLink}
              >
                Confirmer mon email
              </Link>
              <Hr className="border-[#e6ebf1] my-5" />
              <Text className="text-[#525f7f] text-base leading-6 text-left">
                Si vous avez des questions, n'hésitez pas à nous contacter sur notre{' '}
                <Link className="text-[#556cd6]" href={`${baseUrl}/support`}>
                  formulaire de support
                </Link>
                .
              </Text>
              <Text className="text-[#525f7f] text-base leading-6 text-left">— L'équipe de Spice World</Text>
              <Hr className="border-[#e6ebf1] my-5" />
              <Text className="text-[#8898aa] text-xs leading-4">Épices, 123 Rue des Saveurs, Paris, France</Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}

export default VerifyEmail
